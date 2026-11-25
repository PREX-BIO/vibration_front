import Svg, { Circle, Line, Path, Rect, Text } from 'react-native-svg';

import type { ThemeColors } from '@/constants/theme';
import type { ScreenOrientation, SurfaceType } from '@/types/setup';

export function ContactGuide({
  colors,
  orientation = 'screen_up_top_away',
  surfaceType = 'desk',
}: {
  colors: ThemeColors;
  orientation?: ScreenOrientation;
  surfaceType?: SurfaceType;
}) {
  const faceDown = orientation === 'screen_down_top_away';
  const surface = surfaceType === 'floor' ? '바닥' : '책상';
  return (
    <Svg
      width="100%"
      height={198}
      viewBox="0 0 340 198"
      accessibilityRole="image"
      accessibilityLabel={`${surface}에 휴대폰 ${faceDown ? '화면' : '뒷면'}을 놓고, 오른손 검지는 왼쪽 중앙, 엄지는 오른쪽 중앙에서 서로 마주 보게 집습니다.`}
    >
      <Rect x={15} y={18} width={310} height={150} rx={16} fill={colors.surfaceMuted} />
      <Rect
        x={123}
        y={12}
        width={94}
        height={152}
        rx={18}
        fill={colors.surface}
        stroke={colors.border}
        strokeWidth={2}
      />
      {faceDown ? (
        <Circle cx={140} cy={30} r={6} fill={colors.secondaryText} />
      ) : (
        <Line
          x1={159}
          y1={24}
          x2={181}
          y2={24}
          stroke={colors.border}
          strokeWidth={4}
          strokeLinecap="round"
        />
      )}
      <Text x={170} y={71} textAnchor="middle" fill={colors.text} fontSize={12}>
        {faceDown ? '화면이 아래로' : '화면이 위로'}
      </Text>
      <Circle cx={123} cy={92} r={7} fill={colors.primary} />
      <Circle cx={217} cy={92} r={7} fill={colors.primary} />
      <Path
        d="M 76 92 H 108 M 100 85 L 108 92 L 100 99 M 264 92 H 232 M 240 85 L 232 92 L 240 99"
        fill="none"
        stroke={colors.primary}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Text x={58} y={97} textAnchor="middle" fill={colors.text} fontSize={14} fontWeight="600">
        검지
      </Text>
      <Text x={283} y={97} textAnchor="middle" fill={colors.text} fontSize={14} fontWeight="600">
        엄지
      </Text>
      <Text x={170} y={189} textAnchor="middle" fill={colors.secondaryText} fontSize={12}>
        단단하고 수평인 {surface} · 오른손
      </Text>
    </Svg>
  );
}
