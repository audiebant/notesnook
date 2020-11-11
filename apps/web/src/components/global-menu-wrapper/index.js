import React, { useEffect } from "react";
import Menu from "../menu";
import useContextMenu from "../../utils/useContextMenu";
import Animated from "../animated";
import { useAnimation } from "framer-motion";

function GlobalMenuWrapper() {
  const [items, data, title, state, closeMenu] = useContextMenu();
  const animation = useAnimation();
  useEffect(() => {
    if (state === "open") {
      const menu = document.getElementById("globalContextMenu");
      menu.style.display = "block";
      animation.start({
        opacity: 1,
        transition: { duration: 0.2 },
      });
    } else if (state === "close") {
      animation
        .start({
          opacity: 0,
          transition: { duration: 0.1 },
        })
        .then(() => {
          const menu = document.getElementById("globalContextMenu");
          menu.style.display = "none";
        });
    }
  }, [state, animation]);

  return (
    <Animated.Flex initial={{ opacity: 0 }} animate={animation}>
      <Menu
        id="globalContextMenu"
        menuItems={items}
        data={data}
        state={state}
        title={title}
        style={{
          position: "absolute",
          display: "none",
          zIndex: 999,
        }}
        closeMenu={closeMenu}
      />
    </Animated.Flex>
  );
}
export default GlobalMenuWrapper;
