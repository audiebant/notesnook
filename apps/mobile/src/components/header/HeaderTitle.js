import React from 'react';
import {Text} from 'react-native';
import {SIZE, WEIGHT} from '../../common/common';
import {useTracked} from '../../provider';

export const HeaderTitle = ({root}) => {
  const [state, dispatch] = useTracked();
  const {colors, headerTextState} = state;

  const style = {
    fontSize: SIZE.xl,
    color: headerTextState.color || colors.heading,
    fontFamily: WEIGHT.bold,
    alignSelf: 'center',
  };

  return (
    <>
      <Text style={style}>
        <Text
          style={{
            color: colors.accent,
          }}>
          {headerTextState.heading.slice(0, 1) === '#' ? '#' : null}
        </Text>

        {headerTextState.heading.slice(0, 1) === '#'
          ? headerTextState.heading.slice(1)
          : headerTextState.heading}
      </Text>
    </>
  );
};
