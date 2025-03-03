import { useAppState, useDeviceOrientation } from "@react-native-community/hooks"
import { useIsFocused } from "@react-navigation/native"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native"
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaView } from "react-native-safe-area-context"
import Reanimated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import {
  Camera,
  CameraProps,
  CameraRuntimeError,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera"
import type { SpringConfig } from "react-native-reanimated/lib/typescript/animation/springUtils"

import * as ScreenOrientation from "expo-screen-orientation"

const FOCUS_INDICATOR_SIZE = 80
const ZOOM_BUTTON_SIZE = 50
const CONTROL_BUTTON_SIZE = 50
const ZOOM_FACTORS = [0.5, 1, 2] as const

type CaptureMode = "vertical" | "horizontal" | "square"
type CameraPosition = "back" | "front"

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)
const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera)
Reanimated.addWhitelistedNativeProps({
  zoom: true,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  focusIndicator: {
    width: FOCUS_INDICATOR_SIZE,
    height: FOCUS_INDICATOR_SIZE,
    borderWidth: 1.5,
    borderColor: "#fff",
    borderRadius: FOCUS_INDICATOR_SIZE / 2,
    position: "absolute",
  },
  zoomButtonsContainer: {
    position: "absolute",
    bottom: 120,
    alignSelf: "center",
    flexDirection: "row",
    gap: 20,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: 8,
    borderRadius: 25,
  },
  zoomButton: {
    width: ZOOM_BUTTON_SIZE,
    height: ZOOM_BUTTON_SIZE,
    borderRadius: ZOOM_BUTTON_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  controlsContainer: {
    position: "absolute",
    top: 40,
    right: 20,
    flexDirection: "column",
    gap: 20,
  },
  controlButton: {
    width: CONTROL_BUTTON_SIZE,
    height: CONTROL_BUTTON_SIZE,
    borderRadius: CONTROL_BUTTON_SIZE / 2,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  flipButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  modeSelectorContainer: {
    position: "absolute",
    top: 40,
    left: 20,
    flexDirection: "column",
    gap: 15,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: 10,
    borderRadius: 15,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  orientationWarning: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 15,
    alignItems: "center",
  },
  warningText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
})

const CaptationScreenNew = () => {
  const camera = useRef<Camera>(null)

  const [captureMode, setCaptureMode] = useState<CaptureMode>("vertical")
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>("back")
  const [selectedZoom, setSelectedZoom] = useState<number>(1)
  const [cameraType, setCameraType] = useState<"ultra-wide" | "wide">("wide")

  const { hasPermission, requestPermission } = useCameraPermission()
  const isFocused = useIsFocused()
  const appState = useAppState()
  const isActive = isFocused && appState === "active"
  const orientation = useDeviceOrientation()

  const dimensions = Dimensions.get("window")
  const screenWidth = dimensions.width
  const screenHeight = dimensions.height

  const backUltraWideDevice = useCameraDevice("back", {
    physicalDevices: ["ultra-wide-angle-camera"],
  })
  const backWideDevice = useCameraDevice("back", {
    physicalDevices: ["wide-angle-camera"],
  })
  const frontDevice = useCameraDevice("front")

  const backDevice = cameraType === "ultra-wide" ? backUltraWideDevice : backWideDevice
  const device = cameraPosition === "back" ? backDevice : frontDevice

  const format = useCameraFormat(device, [
    { videoResolution: { width: 3840, height: 2160 } },
    { photoResolution: { width: 3840, height: 2160 } },
    { fps: 60 },
  ])

  const zoom = useSharedValue(selectedZoom)
  const zoomOffset = useSharedValue(0)
  const focusPosition = useSharedValue({ x: 0, y: 0 })
  const focusOpacity = useSharedValue(0)

  const isLandscape = orientation === "landscape"
  const shouldShowOrientationWarning =
    (captureMode === "horizontal" && !isLandscape) || (captureMode === "vertical" && isLandscape)

  const onCameraError = useCallback((error: CameraRuntimeError) => {
    console.error(`Camera error: ${error.code}`, error.message)
  }, [])

  const onFocus = useCallback(
    (x: number, y: number) => {
      if (!device?.supportsFocus) return
      camera.current?.focus({ x, y })
      focusPosition.value = { x, y }
      focusOpacity.value = withTiming(1, { duration: 200 }, () => {
        focusOpacity.value = withDelay(800, withTiming(0, { duration: 200 }))
      })
    },
    [device?.supportsFocus, focusPosition, focusOpacity]
  )

  const handleZoomButtonPress = useCallback(
    (zoomFactor: (typeof ZOOM_FACTORS)[number]) => {
      if (!device) return

      const springConfig: SpringConfig = { mass: 1, damping: 15, stiffness: 120 }
      const newCameraType = zoomFactor === 0.5 ? "ultra-wide" : "wide"

      if (cameraPosition === "back") {
        setCameraType(newCameraType)
      }

      setSelectedZoom(zoomFactor)
      zoom.value = withSpring(zoomFactor, springConfig)
    },
    [device, cameraPosition, zoom]
  )

  const handleFlipCamera = useCallback(() => {
    const newPosition = cameraPosition === "back" ? "front" : "back"
    setCameraPosition(newPosition)

    setSelectedZoom(1)
    zoom.value = withSpring(1)

    if (newPosition === "back") {
      setCameraType("wide")
    }
  }, [zoom, cameraPosition])

  const handleCaptureModeChange = useCallback((mode: CaptureMode) => {
    setCaptureMode(mode)
  }, [])

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      zoomOffset.value = zoom.value
    })
    .onUpdate((event) => {
      const newZoom = zoomOffset.value * event.scale
      const maxZoomVal = device?.maxZoom ?? 8

      if (cameraPosition === "back") {
        if (selectedZoom === 0.5) {
          zoom.value = Math.max(0.5, Math.min(1, newZoom))
          if (newZoom > 0.7) runOnJS(setCameraType)("wide")
        } else {
          if (newZoom < 0.7 && Math.abs(selectedZoom - 1) < 0.1 && backUltraWideDevice) {
            runOnJS(setCameraType)("ultra-wide")
            zoom.value = 0.5
          } else {
            zoom.value = Math.max(1, Math.min(maxZoomVal, newZoom))
          }
        }
      } else {
        zoom.value = Math.max(1, Math.min(maxZoomVal, newZoom))
      }
    })
    .onEnd(() => {
      const zVal = zoom.value
      const snapConfig: SpringConfig = { mass: 1, damping: 15, stiffness: 120 }

      if (cameraPosition === "back" && backUltraWideDevice) {
        switch (true) {
          case zVal < 0.7:
            runOnJS(setSelectedZoom)(0.5)
            zoom.value = withSpring(0.5, snapConfig)
            break
          case zVal < 1.5:
            runOnJS(setSelectedZoom)(1)
            zoom.value = withSpring(1, snapConfig)
            break
          case Math.abs(zVal - 2) < 0.3:
            runOnJS(setSelectedZoom)(2)
            zoom.value = withSpring(2, snapConfig)
            break
          default:
            runOnJS(setSelectedZoom)(zVal)
            break
        }
      } else {
        if (zVal < 1.5) {
          runOnJS(setSelectedZoom)(1)
          zoom.value = withSpring(1, snapConfig)
        } else if (Math.abs(zVal - 2) < 0.3) {
          runOnJS(setSelectedZoom)(2)
          zoom.value = withSpring(2, snapConfig)
        } else {
          runOnJS(setSelectedZoom)(zVal)
        }
      }
    })

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((event) => {
      runOnJS(onFocus)(event.x, event.y)
    })

  const gesture = Gesture.Race(pinchGesture, tapGesture)

  const animatedProps = useAnimatedProps<CameraProps>(() => ({ zoom: zoom.value }), [zoom])

  const focusIndicatorStyle = useAnimatedStyle(() => ({
    opacity: focusOpacity.value,
    transform: [
      { translateX: focusPosition.value.x - FOCUS_INDICATOR_SIZE / 2 },
      { translateY: focusPosition.value.y - FOCUS_INDICATOR_SIZE / 2 },
    ] as const,
  }))

  const getCameraDimensions = () => {
    switch (captureMode) {
      case "vertical":
        return { width: screenWidth, height: screenHeight }
      case "horizontal":
        return { width: screenWidth, height: screenHeight }
      case "square": {
        const size = Math.min(screenWidth, screenHeight)
        return { width: size, height: size }
      }
      default:
        return { width: screenWidth, height: screenHeight }
    }
  }

  useEffect(() => {
    requestPermission()
  }, [])

  useEffect(() => {
    const unlockScreenOerientation = async () => {
      await ScreenOrientation.unlockAsync()
    }
    unlockScreenOerientation()
  }, [])

  if (!hasPermission) return null
  if (device == null) return null

  return (
    <GestureHandlerRootView>
      <SafeAreaView style={styles.container}>
        <GestureDetector gesture={gesture}>
          <ReanimatedCamera
            ref={camera}
            style={[StyleSheet.absoluteFill, getCameraDimensions()]}
            device={device}
            format={format}
            isActive={isActive}
            animatedProps={animatedProps}
            onError={onCameraError}
            photo={true}
            video={true}
          />
        </GestureDetector>
        <Reanimated.View style={[styles.focusIndicator, focusIndicatorStyle]} />
        <View style={styles.zoomButtonsContainer}>
          {ZOOM_FACTORS.map((factor) => (
            <AnimatedPressable
              key={factor}
              style={[
                styles.zoomButton,
                {
                  opacity: selectedZoom === factor ? 1 : 0.8,

                  display: factor === 0.5 && (!backUltraWideDevice || cameraPosition === "front") ? "none" : "flex",
                },
              ]}
              onPress={() => handleZoomButtonPress(factor)}
            >
              <Reanimated.Text style={[styles.zoomText, { color: selectedZoom === factor ? "#FFD700" : "#fff" }]}>
                {factor + "x"}
              </Reanimated.Text>
            </AnimatedPressable>
          ))}
        </View>

        <View style={styles.controlsContainer}>
          <Pressable style={styles.controlButton} onPress={handleFlipCamera}>
            <Text style={styles.flipButtonText}>FLIP</Text>
          </Pressable>
        </View>

        <View style={styles.modeSelectorContainer}>
          {(["vertical", "horizontal", "square"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[
                styles.modeButton,
                { backgroundColor: captureMode === mode ? "rgba(255, 215, 0, 0.3)" : "transparent" },
              ]}
              onPress={() => handleCaptureModeChange(mode)}
            >
              <Text style={[styles.modeText, { color: captureMode === mode ? "#FFD700" : "#fff" }]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </Pressable>
          ))}
          <Text style={{ color: "white" }}>{JSON.stringify(orientation)}Hey</Text>
        </View>

        {shouldShowOrientationWarning && (
          <View style={styles.orientationWarning}>
            <Text style={styles.warningText}>
              {captureMode === "horizontal"
                ? "Rotate device to landscape for best results"
                : "Rotate device to portrait for best results"}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  )
}

export default CaptationScreenNew
