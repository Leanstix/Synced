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
  x,
  y,
  w,
  h,
  angle,
  primary,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  primary?: boolean;
}) {
  return (
    <G rotation={angle} origin={`${x + w / 2}, ${y + h / 2}`}>
      <Rect x={x + 5} y={y + 8} width={w} height={h} rx={14} fill="#080B09" />
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill={primary ? "#344330" : "#252E27"}
        stroke={primary ? "#8BA177" : "#5D695E"}
        strokeWidth={1.3}
      />
      <Rect
        x={x + 5}
        y={y + 6}
        width={w - 10}
        height={h - 12}
        rx={10}
        fill="#0E1410"
      />
      <Rect
        x={x + w / 2 - 11}
        y={y + 10}
        width={22}
        height={4}
        rx={2}
        fill="#505E4C"
      />
      <Rect
        x={x + 15}
        y={y + 33}
        width={w - 30}
        height={6}
        rx={3}
        fill={primary ? "#D4FF74" : "#5B7154"}
      />
      <Rect
        x={x + 15}
        y={y + 46}
        width={w - 42}
        height={4}
        rx={2}
        fill="#2F3C2B"
      />
      {[0, 1, 2].map((i) => (
        <Rect
          key={i}
          x={x + 14}
          y={y + 64 + i * 18}
          width={w - 28}
          height={13}
          rx={4}
          fill={primary && i === 0 ? "#506437" : "#232E20"}
        />
      ))}
      <Rect
        x={x + w / 2 - 13}
        y={y + h - 13}
        width={26}
        height={3}
        rx={2}
        fill="#586850"
      />
    </G>
  );
}

export function PhoneArtwork() {
  return (
    <Svg width="100%" height={176} viewBox="0 0 350 202" accessible={false}>
      <Ellipse
        cx={176}
        cy={103}
        rx={148}
        ry={80}
        stroke="#2F3631"
        fill="none"
      />
      <Ellipse
        cx={176}
        cy={103}
        rx={117}
        ry={115}
        stroke="#2F3631"
        fill="none"
      />
      <Line x1={9} y1={104} x2={342} y2={104} stroke="#242A25" />
      <Line x1={175} y1={3} x2={175} y2={201} stroke="#242A25" />
      <Phone x={83} y={43} w={77} h={132} angle={-12} />
      <Phone x={184} y={23} w={86} h={148} angle={10} primary />
      <Rect x={151} y={83} width={46} height={42} rx={15} fill="#D4FF74" />
