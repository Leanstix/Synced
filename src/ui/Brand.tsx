import React from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

export function SyncedMark({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      <Rect width={40} height={40} rx={13} fill="#D4FF74" />
      <Path
        d="M26 11H18C8 11 9 21 18 21H22M14 29H22C32 29 31 19 22 19H18"
        fill="none"
        stroke="#10180D"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Phone({
