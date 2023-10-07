/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { ICollection } from "./collection";
import { getId } from "../utils/id";
import { getContentFromData } from "../content-types";
import { ResolveHashes } from "../content-types/tiptap";
import { isCipher } from "../database/crypto";
import {
  Attachment,
  ContentItem,
  ContentType,
  EncryptedContentItem,
  UnencryptedContentItem,
  isDeleted
} from "../types";
import Database from "../api";
import { getOutputType } from "./attachments";
import { SQLCollection } from "../database/sql-collection";

export const EMPTY_CONTENT = (noteId: string): UnencryptedContentItem => ({
  noteId,
  dateCreated: Date.now(),
  dateEdited: Date.now(),
  dateModified: Date.now(),
  id: getId(),
  localOnly: true,
  type: "tiptap",
  data: "<p></p>",
  locked: false
});

export class Content implements ICollection {
  name = "content";
  readonly collection: SQLCollection<"content", ContentItem>;
  constructor(private readonly db: Database) {
    this.collection = new SQLCollection(db.sql, "content", db.eventManager);
  }

  async init() {
    await this.collection.init();
  }

  async add(content: Partial<ContentItem>) {
    if (typeof content.data === "object") {
      if ("data" in content.data && typeof content.data.data === "string")
        content.data = content.data.data;
      else if (!content.data.iv && !content.data.cipher)
        content.data = `<p>Content is invalid: ${JSON.stringify(
          content.data
        )}</p>`;
    }

    if (content.remote)
      throw new Error(
        "Please use db.content.merge for merging remote content."
      );

    const id = content.id || getId();
    const oldContent = content.id ? await this.get(content.id) : undefined;
    const noteId = oldContent?.noteId || content.noteId;
    if (!noteId) throw new Error("No noteId found to link the content to.");

    const encryptedData = isCipher(content.data)
      ? content.data
      : oldContent && isCipher(oldContent.data)
      ? oldContent.data
      : null;

    const unencryptedData =
      typeof content.data === "string"
        ? content.data
        : oldContent && typeof oldContent.data === "string"
        ? oldContent.data
        : "<p></p>";

    const contentItem: ContentItem = {
      type: "tiptap",
      noteId,
      id,

      dateEdited: content.dateEdited || oldContent?.dateEdited || Date.now(),
      dateCreated: content.dateCreated || oldContent?.dateCreated || Date.now(),
      dateModified: Date.now(),
      localOnly: content.localOnly || !!oldContent?.localOnly,

      conflicted: content.conflicted || oldContent?.conflicted,
      dateResolved: content.dateResolved || oldContent?.dateResolved,

      ...(encryptedData
        ? { locked: true, data: encryptedData }
        : { locked: false, data: unencryptedData })
    };

    await this.collection.upsert(
      contentItem.locked
        ? contentItem
        : await this.extractAttachments(contentItem)
    );

    if (content.sessionId)
      await this.db.noteHistory.add(content.sessionId, contentItem);

    return id;
  }

  async get(id: string) {
    const content = await this.collection.get(id);
    if (!content || isDeleted(content)) return;
    return content;
  }

  // async raw(id: string) {
  //   const content = await this.collection.get(id);
  //   if (!content) return;
  //   return content;
  // }

  remove(...ids: string[]) {
    return this.collection.softDelete(ids);
  }

  removeByNoteId(...ids: string[]) {
    return this.db
      .sql()
      .replaceInto("content")
      .columns(["id", "dateModified", "deleted"])
      .expression((eb) =>
        eb
          .selectFrom("content")
          .where("noteId", "in", ids)
          .select((eb) => [
            "content.id",
            eb.lit(Date.now()).as("dateModified"),
            eb.lit(1).as("deleted")
          ])
      )
      .execute();
  }

  async updateByNoteId(partial: Partial<ContentItem>, ...ids: string[]) {
    await this.db
      .sql()
      .updateTable("content")
      .where("noteId", "in", ids)
      .set({
        ...partial,
        dateModified: Date.now()
      })
      .execute();
  }
  // multi(ids: string[]) {
  //   return this.collection.getItems(ids);
  // }

  exists(id: string) {
    return this.collection.exists(id);
  }

  // async all() {
  //   return Object.values(
  //     await this.collection.getItems(this.collection.indexer.indices)
  //   );
  // }

  insertMedia(contentItem: UnencryptedContentItem) {
    return this.insert(contentItem, async (hashes) => {
      const sources: Record<string, string> = {};
      for (const hash of hashes) {
        const src = await this.db.attachments.read(hash, "base64");
        if (!src) continue;
        sources[hash] = src;
      }
      return sources;
    });
  }

  insertPlaceholders(contentItem: UnencryptedContentItem, placeholder: string) {
    return this.insert(contentItem, async (hashes) => {
      return Object.fromEntries(hashes.map((h) => [h, placeholder]));
    });
  }

  async downloadMedia(
    groupId: string,
    contentItem: { type: ContentType; data: string },
    notify = true
  ) {
    const content = getContentFromData(contentItem.type, contentItem.data);
    if (!content) return contentItem;
    contentItem.data = await content.insertMedia(async (hashes) => {
      const attachments: Attachment[] = [];
      for (const hash of hashes) {
        const attachment = await this.db.attachments.attachment(hash);
        if (!attachment) continue;
        attachments.push(attachment);
      }

      await this.db.fs().queueDownloads(
        attachments.map((a) => ({
          filename: a.hash,
          chunkSize: a.chunkSize
        })),
        groupId,
        notify ? { readOnDownload: false } : undefined
      );

      const sources: Record<string, string> = {};
      for (const attachment of attachments) {
        const src = await this.db.attachments.read(
          attachment.hash,
          getOutputType(attachment)
        );
        if (!src) continue;
        sources[attachment.hash] = src;
      }
      return sources;
    });
    return contentItem;
  }

  private async insert(
    contentItem: UnencryptedContentItem,
    getData: ResolveHashes
  ) {
    const content = getContentFromData(contentItem.type, contentItem.data);
    if (!content) return contentItem;
    contentItem.data = await content.insertMedia(getData);
    return contentItem;
  }

  async removeAttachments(id: string, hashes: string[]) {
    const contentItem = await this.get(id);
    if (!contentItem || isCipher(contentItem.data)) return;
    const content = getContentFromData(contentItem.type, contentItem.data);
    if (!content) return;
    contentItem.data = content.removeAttachments(hashes);
    await this.add(contentItem);
  }

  async extractAttachments(contentItem: UnencryptedContentItem) {
    if (contentItem.localOnly) return contentItem;

    const content = getContentFromData(contentItem.type, contentItem.data);
    if (!content) return contentItem;
    const { data, hashes } = await content.extractAttachments(
      this.db.attachments.save
    );

    const noteAttachments = await this.db.relations
      .from({ type: "note", id: contentItem.noteId }, "attachment")
      .resolve();

    const toDelete = noteAttachments.filter((attachment) => {
      return hashes.every((hash) => hash !== attachment.hash);
    });

    const toAdd = hashes.filter((hash) => {
      return hash && noteAttachments.every((a) => hash !== a.hash);
    });

    for (const attachment of toDelete) {
      await this.db.relations.unlink(
        {
          id: contentItem.noteId,
          type: "note"
        },
        attachment
      );
    }

    for (const hash of toAdd) {
      const attachment = await this.db.attachments.attachment(hash);
      if (!attachment) continue;
      await this.db.relations.add(
        {
          id: contentItem.noteId,
          type: "note"
        },
        attachment
      );
    }

    if (toAdd.length > 0) {
      contentItem.dateModified = Date.now();
    }
    contentItem.data = data;
    return contentItem;
  }

  // async cleanup() {
  //   const indices = this.collection.indexer.indices;
  //   await this.db.notes.init();
  //   const notes = this.db.notes.all;
  //   if (!notes.length && indices.length > 0) return [];
  //   const ids = [];
  //   for (const contentId of indices) {
  //     const noteIndex = notes.findIndex((note) => note.contentId === contentId);
  //     const isOrphaned = noteIndex === -1;
  //     if (isOrphaned) {
  //       ids.push(contentId);
  //       await this.collection.deleteItem(contentId);
  //     } else if (notes[noteIndex].localOnly) {
  //       ids.push(contentId);
  //     }
  //   }
  //   return ids;
  // }
}

export function isUnencryptedContent(
  content: ContentItem
): content is UnencryptedContentItem {
  return content.locked === false;
}

export function isEncryptedContent(
  content: ContentItem
): content is EncryptedContentItem {
  return content.locked === true;
}
