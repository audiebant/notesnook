import React from 'react';
import {ActivityIndicator, Platform, StyleSheet, View} from 'react-native';
import * as Animatable from 'react-native-animatable';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {SIZE} from '../../common/common';
import {useTracked} from '../../provider';
import {eSendEvent} from '../../services/eventManager';
import NavigationService from '../../services/NavigationService';
import {useHideHeader} from '../../utils/hooks';
import {DDS, w} from '../../utils/utils';
import {ActionIcon} from '../ActionIcon';
import {HeaderMenu} from './HeaderMenu';
import {HeaderTitle} from './HeaderTitle';

export const Header = ({showSearch, root}) => {
  const [state, dispatch] = useTracked();
  const {colors, syncing, headerState} = state;

  const insets = useSafeAreaInsets();
  const hideHeader = useHideHeader();

  const onLeftButtonPress = () => {
    if (!headerState.canGoBack) {
      NavigationService.openDrawer();
      return;
    }
    NavigationService.goBack();
  };

  return (
    <View
      style={[
        styles.container,
        {
          marginTop: insets.top,
          backgroundColor: colors.bg,
          overflow: 'hidden',
        },
      ]}>
      <Animatable.View
        transition={['opacity']}
        duration={300}
        style={[
          styles.loadingContainer,
          {
            opacity: syncing ? 1 : 0,
          },
        ]}>
        <View
          style={[
            styles.loadingInnerContainer,
            {
              backgroundColor: colors.bg,
            },
          ]}
        />
        <ActivityIndicator size={25} color={colors.accent} />
      </Animatable.View>

      <View style={styles.leftBtnContainer}>
        {!DDS.isTab ? (
          <ActionIcon
            customStyle={styles.leftBtn}
            onPress={onLeftButtonPress}
            name={headerState.canGoBack ? 'arrow-left' : 'menu'}
            size={SIZE.xxxl}
            color={colors.pri}
            iconStyle={{
              marginLeft: headerState.canGoBack ? -5 : 0,
            }}
          />
        ) : undefined}

        {Platform.OS === 'android' ? <HeaderTitle root={root} /> : null}
      </View>
      {Platform.OS !== 'android' ? <HeaderTitle root={root} /> : null}

      <View style={styles.rightBtnContainer}>
        <Animatable.View
          transition="opacity"
          useNativeDriver={true}
          duration={500}
          style={{
            opacity: hideHeader ? 1 : 0,
          }}>
          <ActionIcon
            onPress={() => {
              if (!hideHeader) return;
              setHideHeader(false);
              eSendEvent('showSearch');
            }}
            name="magnify"
            size={SIZE.xl}
            color={colors.pri}
            style={styles.rightBtn}
          />
        </Animatable.View>

        <HeaderMenu />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    zIndex: 11,
    height: 50,
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    width: '100%',
  },
  loadingContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    left: w / 2 - 20,
    top: -20,
    width: 40,
    height: 40,
    position: 'absolute',
  },
  loadingInnerContainer: {
    width: 40,
    height: 20,
    position: 'absolute',
    zIndex: 10,
    top: 0,
  },
  leftBtnContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'absolute',
    left: 12,
  },
  leftBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
    width: 40,
    borderRadius: 100,
    marginLeft: -5,
    marginRight: 25,
  },
  rightBtnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    right: 12,
  },
  rightBtn: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 40,
    width: 50,
    paddingRight: 0,
  },
});
