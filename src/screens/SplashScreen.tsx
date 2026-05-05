import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import Svg, { Circle, Line, Defs, FeGaussianBlur, Filter, FeMerge, FeMergeNode } from 'react-native-svg';

// Color constants from design
const PINK = '#FF2D87';
const CYAN = '#00F5FF';
const GREEN = '#00FF41';
const WHITE = '#ffffff';
const BG = '#000008';

// G letter dot grid pattern (9x9 grid)
const G_FILLED = new Set([
  '2,0','3,0','4,0','5,0','6,0',
  '1,1','7,1',
  '0,2','8,2',
  '0,3',
  '0,4','5,4','6,4','7,4','8,4',
  '0,5',
  '0,6','8,6',
  '1,7','8,7',
  '2,8','3,8','4,8','5,8','6,8',
]);
const G_GRID = 9;

// Build G logo structure
function buildG(cx: number, cy: number, size: number) {
  const step = size / (G_GRID - 1);
  const ox = cx - size / 2;
  const oy = cy - size / 2;
  const dots: Array<{ x: number; y: number; key: string; index: number }> = [];
  const edges: Array<[number, number, number, number]> = [];

  let index = 0;
  for (let row = 0; row < G_GRID; row++) {
    for (let col = 0; col < G_GRID; col++) {
      const x = ox + col * step;
      const y = oy + row * step;
      const key = `${col},${row}`;
      if (G_FILLED.has(key)) {
        dots.push({ x, y, key, index: index++ });
        // Horizontal edge
        if (col < G_GRID - 1 && G_FILLED.has(`${col + 1},${row}`)) {
          edges.push([x, y, x + step, y]);
        }
        // Vertical edge
        if (row < G_GRID - 1 && G_FILLED.has(`${col},${row + 1}`)) {
          edges.push([x, y, x, y + step]);
        }
      }
    }
  }
  return { dots, edges, step };
}

// Easing functions
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const remap = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

export default function SplashScreen() {
  const { width, height } = Dimensions.get('window');

  // Animation values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkY = useRef(new Animated.Value(12)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const animProgress = useRef(new Animated.Value(0)).current;

  const [statusText, setStatusText] = useState('initializing node...');
  const [logoProgress, setLogoProgress] = useState(0);

  // Calculate logo size (responsive)
  const logoSize = Math.min(width, height) * 0.62;
  const cx = logoSize / 2;
  const cy = logoSize / 2;
  const { dots, edges, step } = buildG(cx, cy, logoSize * 0.88);
  const dotR = step * 0.27;
  const edgeW = Math.max(0.5, step * 0.055);

  // Status messages timeline
  const statusMessages = [
    { time: 0, text: 'initializing node...' },
    { time: 1000, text: 'connecting to mesh...' },
    { time: 2200, text: 'loading inference engine...' },
    { time: 3500, text: 'auth_level_0 granted' },
    { time: 4200, text: 'node online // 0x4f2a...e1c' },
  ];

  useEffect(() => {
    // Fast smooth animation - complete in ~1 second, then stay completely still

    // Logo assembly starts immediately
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // Animate logo progress for dot reveal
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Update logo progress
    const progressListener = animProgress.addListener(({ value }) => {
      setLogoProgress(value);
    });

    // Wordmark fade-in (starts at 0.6s)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, 600);

    // Tagline fade-in (starts at 0.8s)
    setTimeout(() => {
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }, 800);

    // Status bar fade-in
    Animated.timing(statusOpacity, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Progress bar - fill once to 100% and stay there
    Animated.timing(progressWidth, {
      toValue: 100,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();

    return () => {
      animProgress.removeListener(progressListener);
    };
  }, []);

  // Calculate which dots to show based on progress
  const visibleDots = dots.map((dot, i) => {
    const delay = i / dots.length * 0.6;
    const p = easeOut(remap(logoProgress, delay, delay + 0.4));
    return { ...dot, progress: p };
  }).filter(d => d.progress > 0);

  return (
    <View style={styles.container}>
      {/* Logo */}
      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Svg width={logoSize} height={logoSize} viewBox={`0 0 ${logoSize} ${logoSize}`}>
          <Defs>
            <Filter id="glow-p">
              <FeGaussianBlur stdDeviation="2" result="b" />
              <FeMerge>
                <FeMergeNode in="b" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
            <Filter id="glow-c">
              <FeGaussianBlur stdDeviation="3" result="b" />
              <FeMerge>
                <FeMergeNode in="b" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
          </Defs>

          {/* Background grid dots (dimmed) */}
          {Array.from({ length: G_GRID * G_GRID }).map((_, i) => {
            const row = Math.floor(i / G_GRID);
            const col = i % G_GRID;
            const key = `${col},${row}`;
            if (G_FILLED.has(key)) return null;

            const ox = cx - logoSize * 0.88 / 2;
            const oy = cy - logoSize * 0.88 / 2;
            const x = ox + col * step;
            const y = oy + row * step;

            return (
              <Circle
                key={`bg-${key}`}
                cx={x}
                cy={y}
                r={dotR * 0.3}
                fill={WHITE}
                fillOpacity={0.06}
              />
            );
          })}

          {/* Edges */}
          {edges.map((edge, i) => (
            <Line
              key={`edge-${i}`}
              x1={edge[0]}
              y1={edge[1]}
              x2={edge[2]}
              y2={edge[3]}
              stroke={CYAN}
              strokeWidth={edgeW}
              strokeOpacity={logoProgress * 0.5}
            />
          ))}

          {/* Dots with glitch effect */}
          {visibleDots.map(({ x, y, key, progress }) => {
            const r = dotR * progress;
            const glitchIntensity = 0.85;
            const gx = dotR * 0.5 * glitchIntensity;
            const gy = dotR * -0.18 * glitchIntensity;
            const cx2 = dotR * -0.36 * glitchIntensity;
            const cy2 = dotR * 0.14 * glitchIntensity;

            return (
              <React.Fragment key={key}>
                {/* Glow halo */}
                <Circle cx={x} cy={y} r={r * 2.2} fill={PINK} fillOpacity={progress * 0.06} />
                {/* Cyan ghost */}
                <Circle cx={x + cx2} cy={y + cy2} r={r * 0.88} fill={CYAN} fillOpacity={glitchIntensity * progress * 0.65} filter="url(#glow-c)" />
                {/* Pink ghost */}
                <Circle cx={x + gx} cy={y + gy} r={r * 0.88} fill={PINK} fillOpacity={glitchIntensity * progress * 0.65} filter="url(#glow-p)" />
                {/* White core */}
                <Circle cx={x} cy={y} r={r * 0.68} fill={WHITE} />
              </React.Fragment>
            );
          })}
        </Svg>
      </Animated.View>

      {/* Wordmark */}
      <Animated.View
        style={[
          styles.wordmarkWrap,
          {
            opacity: wordmarkOpacity,
            transform: [{ translateY: wordmarkY }],
          },
        ]}
      >
        <Text style={styles.wordmark}>
          GPTEE<Text style={styles.pink}>.</Text><Text style={styles.cyan}>ORG</Text>
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        decentralized p2p ai · encrypted inference
      </Animated.Text>

      {/* Status */}
      <Animated.View style={[styles.status, { opacity: statusOpacity }]}>
        <Text style={styles.statusText}>{statusText}</Text>
        <View style={styles.progressBar}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    position: 'relative',
  },
  wordmarkWrap: {
    marginTop: 28,
  },
  wordmark: {
    fontFamily: 'monospace',
    fontSize: Math.max(22, Math.min(width * 0.055, 38)),
    fontWeight: 'bold',
    letterSpacing: 8,
    color: WHITE,
    textAlign: 'center',
  },
  pink: {
    color: PINK,
  },
  cyan: {
    color: CYAN,
  },
  tagline: {
    marginTop: 10,
    fontFamily: 'monospace',
    fontSize: Math.max(9, Math.min(width * 0.022, 13)),
    letterSpacing: 2,
    color: `${CYAN}73`, // rgba(0,245,255,0.45)
    textAlign: 'center',
  },
  status: {
    position: 'absolute',
    bottom: Math.max(24, Math.min(height * 0.05, 60)),
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: Math.max(8, Math.min(width * 0.018, 11)),
    letterSpacing: 2,
    color: `${CYAN}4D`, // rgba(0,245,255,0.3)
  },
  progressBar: {
    width: Math.max(120, Math.min(width * 0.3, 180)),
    height: 1,
    backgroundColor: `${CYAN}26`, // rgba(0,245,255,0.15)
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: CYAN,
  },
});
