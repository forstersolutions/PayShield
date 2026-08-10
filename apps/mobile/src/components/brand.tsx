import { Image, StyleSheet, Text, View, type ImageStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import graystonLogo from "@/assets/brand/grayston-logo-full.png";
import { Colors, Fonts } from "@/constants/theme";

export function PayShieldMark({ size = 36 }: { size?: number }) {
  return (
    <Svg
      accessibilityElementsHidden
      height={size}
      importantForAccessibility="no"
      viewBox="0 0 512 512"
      width={size}
    >
      <Defs>
        <LinearGradient id="shield" x1="94" x2="418" y1="80" y2="430">
          <Stop offset="0" stopColor="#14B7FF" />
          <Stop offset="0.46" stopColor="#156DFF" />
          <Stop offset="1" stopColor="#061943" />
        </LinearGradient>
        <LinearGradient id="speed" x1="64" x2="262" y1="244" y2="244">
          <Stop offset="0" stopColor="#2BDCFF" />
          <Stop offset="1" stopColor="#156DFF" />
        </LinearGradient>
      </Defs>
      <Path
        d="M256 54c50 34 103 54 162 60v132c0 95-50 169-162 212C144 415 94 341 94 246V114c59-6 112-26 162-60Zm0 43c-38 25-80 42-127 51v98c0 74 35 132 127 170 92-38 127-96 127-170v-98c-47-9-89-26-127-51Z"
        fill="url(#shield)"
      />
      <Path
        d="M154 216h119c49 0 84 31 84 76 0 46-35 77-84 77h-66v-41h66c26 0 42-14 42-36s-16-36-42-36H154v-40Z"
        fill="url(#shield)"
      />
      <Path
        d="M62 260c0-11 8-19 19-19h104c11 0 19 8 19 19s-8 19-19 19H81c-11 0-19-8-19-19Zm24 62c0-11 8-19 19-19h74c11 0 19 8 19 19s-8 19-19 19h-74c-11 0-19-8-19-19Z"
        fill="url(#speed)"
      />
    </Svg>
  );
}

export function PayShieldLogo({ compact = false }: { compact?: boolean }) {
  return (
    <View accessibilityLabel="PayShield" style={styles.lockup}>
      <PayShieldMark size={compact ? 29 : 36} />
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>
        <Text style={styles.pay}>Pay</Text>
        Shield
      </Text>
    </View>
  );
}

export function GraystonLogo({ style }: { style?: ImageStyle }) {
  return (
    <Image
      accessibilityLabel="Grayston Technologies"
      alt="Grayston Technologies"
      resizeMode="contain"
      source={graystonLogo}
      style={[styles.grayston, style]}
    />
  );
}

const styles = StyleSheet.create({
  lockup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  wordmark: {
    color: Colors.ink,
    fontFamily: Fonts.rounded,
    fontSize: 22,
    fontWeight: "700",
  },
  wordmarkCompact: {
    fontSize: 18,
  },
  pay: {
    color: "#2E8BFF",
  },
  grayston: {
    height: 32,
    width: 116,
  },
});
