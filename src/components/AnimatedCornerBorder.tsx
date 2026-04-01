import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface AnimatedCornerBorderProps {
  isActive: boolean;
  children: React.ReactNode;
  borderRadius?: number;
  cornerSize?: number;
  borderWidth?: number;
  color?: string;
}

export const AnimatedCornerBorder: React.FC<AnimatedCornerBorderProps> = ({
  isActive,
  children,
  borderRadius = 6,
  cornerSize = 20,
  borderWidth = 3,
  color = '#27c93f',
}) => {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      // Start continuous rotation animation
      Animated.loop(
        Animated.timing(animValue, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      animValue.stopAnimation();
      animValue.setValue(0);
    }

    return () => {
      animValue.stopAnimation();
    };
  }, [isActive, animValue]);

  if (!isActive) {
    return <View>{children}</View>;
  }

  // Calculate opacity for each corner (they fade in/out as they travel)
  const opacityTopLeft = animValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0, 0, 0, 1],
  });

  const opacityTopRight = animValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 1, 0, 0, 0],
  });

  const opacityBottomRight = animValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 0, 1, 0, 0],
  });

  const opacityBottomLeft = animValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 0, 0, 1, 0],
  });

  return (
    <View style={styles.container}>
      {/* Top-left corner */}
      <Animated.View
        style={[
          styles.corner,
          styles.topLeft,
          {
            width: cornerSize,
            height: cornerSize,
            borderTopWidth: borderWidth,
            borderLeftWidth: borderWidth,
            borderTopLeftRadius: borderRadius,
            borderColor: color,
            opacity: opacityTopLeft,
          },
        ]}
      />

      {/* Top-right corner */}
      <Animated.View
        style={[
          styles.corner,
          styles.topRight,
          {
            width: cornerSize,
            height: cornerSize,
            borderTopWidth: borderWidth,
            borderRightWidth: borderWidth,
            borderTopRightRadius: borderRadius,
            borderColor: color,
            opacity: opacityTopRight,
          },
        ]}
      />

      {/* Bottom-right corner */}
      <Animated.View
        style={[
          styles.corner,
          styles.bottomRight,
          {
            width: cornerSize,
            height: cornerSize,
            borderBottomWidth: borderWidth,
            borderRightWidth: borderWidth,
            borderBottomRightRadius: borderRadius,
            borderColor: color,
            opacity: opacityBottomRight,
          },
        ]}
      />

      {/* Bottom-left corner */}
      <Animated.View
        style={[
          styles.corner,
          styles.bottomLeft,
          {
            width: cornerSize,
            height: cornerSize,
            borderBottomWidth: borderWidth,
            borderLeftWidth: borderWidth,
            borderBottomLeftRadius: borderRadius,
            borderColor: color,
            opacity: opacityBottomLeft,
          },
        ]}
      />

      {/* Content */}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    zIndex: 10,
  },
  topLeft: {
    top: 0,
    left: 0,
  },
  topRight: {
    top: 0,
    right: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
  },
});
