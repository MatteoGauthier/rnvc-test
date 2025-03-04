import { useAppState } from "@react-native-community/hooks"
import * as MediaLibrary from "expo-media-library"
import { useNavigation } from "expo-router"
import * as ScreenOrientation from "expo-screen-orientation"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Dimensions, StatusBar, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Camera,
  CameraRuntimeError,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  VideoFile,
} from "react-native-vision-camera"

type VideoMode = "vertical" | "horizontal" | "square"

interface VideoModeConfig {
  name: string
  portraitRatio: number
  landscapeRatio: number
}

const VIDEO_MODES: Record<VideoMode, VideoModeConfig> = {
  vertical: {
    name: "Vertical",
    portraitRatio: 16 / 9,
    landscapeRatio: 9 / 16,
  },
  horizontal: {
    name: "Horizontal",
    portraitRatio: 9 / 16,
    landscapeRatio: 16 / 9,
  },
  square: {
    name: "Square",
    portraitRatio: 1,
    landscapeRatio: 1,
  },
}

export default function CameraScreen(): React.ReactElement {
  const { hasPermission, requestPermission } = useCameraPermission()
  const [isRecording, setIsRecording] = useState(false)
  const [selectedMode, setSelectedMode] = useState<VideoMode>("vertical")
  const [deviceOrientation, setDeviceOrientation] = useState<ScreenOrientation.Orientation>(
    ScreenOrientation.Orientation.PORTRAIT_UP
  )
  const [cameraKey, setCameraKey] = useState(0)

  const navigation = useNavigation()
  const isFocused = navigation.isFocused()
  const appState = useAppState()
  const isActive = isFocused && appState === "active"

  const insets = useSafeAreaInsets()

  const camera = useRef<Camera>(null)
  const device = useCameraDevice("back")

  const format = useCameraFormat(device, [{ videoResolution: { width: 1920, height: 1080 } }, { fps: 30 }])

  const verticalFormat = useCameraFormat(device, [{ videoResolution: { width: 1080, height: 1920 } }, { fps: 30 }])
  const horizontalFormat = useCameraFormat(device, [{ videoResolution: { width: 1920, height: 1080 } }, { fps: 30 }])
  const squareFormat = useCameraFormat(device, [{ videoResolution: { width: 1080, height: 1080 } }, { fps: 30 }])

  const videoFormat = useMemo(() => {
    if (!device) return format

    switch (selectedMode) {
      case "vertical":
        return verticalFormat || format
      case "horizontal":
        return horizontalFormat || format
      case "square":
        return squareFormat || format
      default:
        return format
    }
  }, [device, selectedMode, format, verticalFormat, horizontalFormat, squareFormat])

  const isLandscape = useMemo(() => {
    return (
      deviceOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
      deviceOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
    )
  }, [deviceOrientation])

  const aspectRatio = useMemo(() => {
    const screenWidth = Dimensions.get("window").width
    const screenHeight = Dimensions.get("window").height
    const modeConfig = VIDEO_MODES[selectedMode]

    if (isLandscape) {
      if (selectedMode === "vertical") {
        return {
          width: screenHeight * modeConfig.landscapeRatio,
          height: screenHeight,
        }
      } else if (selectedMode === "horizontal") {
        const widthConstrainedHeight = screenWidth / modeConfig.landscapeRatio
        const heightConstrainedWidth = screenHeight * modeConfig.landscapeRatio

        if (widthConstrainedHeight > screenHeight) {
          return {
            width: heightConstrainedWidth,
            height: screenHeight,
          }
        } else {
          return {
            width: screenWidth,
            height: widthConstrainedHeight,
          }
        }
      } else {
        const size = Math.min(screenWidth, screenHeight)
        return {
          width: size,
          height: size,
        }
      }
    } else {
      if (selectedMode === "vertical") {
        return {
          width: screenWidth,
          height: screenWidth * modeConfig.portraitRatio,
        }
      } else if (selectedMode === "horizontal") {
        return {
          width: screenWidth,
          height: screenWidth * modeConfig.portraitRatio,
        }
      } else {
        const size = Math.min(screenWidth, screenHeight)
        return {
          width: size,
          height: size,
        }
      }
    }
  }, [selectedMode, isLandscape])

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch((err) => {
        console.error("Failed to request permission:", err)
        Alert.alert("Failed to request camera permission")
      })
    }
  }, [hasPermission, requestPermission])

  useEffect(() => {
    let subscription: ScreenOrientation.Subscription | undefined

    const setupOrientation = async () => {
      try {
        await ScreenOrientation.unlockAsync()

        subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
          console.log("Orientation changed:", orientationInfo.orientation)
          setDeviceOrientation(orientationInfo.orientation)

          setTimeout(() => {
            setCameraKey((prev) => prev + 1)
          }, 100)
        })

        const currentOrientation = await ScreenOrientation.getOrientationAsync()
        console.log("Current orientation:", currentOrientation)
        setDeviceOrientation(currentOrientation)
      } catch (err) {
        console.error("Failed to setup orientation:", err)
        Alert.alert("Failed to configure device orientation")
      }
    }

    setupOrientation()

    return () => {
      if (subscription) {
        ScreenOrientation.removeOrientationChangeListener(subscription)
      }

      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(console.error)
    }
  }, [])

  const orientationGuidance = useMemo(() => {
    switch (selectedMode) {
      case "vertical":
        return "Rotate to portrait for optimal vertical video"
      case "horizontal":
        return "Rotate to landscape for optimal horizontal video"
      case "square":
        return "Hold the phone in portrait mode for optimal square video"
    }
  }, [selectedMode])

  const onCameraError = useCallback((error: CameraRuntimeError) => {
    console.error(`Camera error: ${error.code}`, error.message)
    Alert.alert(`Camera error: ${error.message}`)
  }, [])

  const startRecording = useCallback(async () => {
    if (!camera.current) return

    setIsRecording(true)
    try {
      const formatText =
        selectedMode === "vertical" ? "9:16 vertical" : selectedMode === "horizontal" ? "16:9 horizontal" : "1:1 square"

      console.log(`Recording in ${formatText} format`)

      camera.current.startRecording({
        fileType: "mp4",
        videoCodec: "h264",
        onRecordingFinished: async (video: VideoFile) => {
          console.log("Recording finished:", video)

          const path = video.path
          MediaLibrary.saveToLibraryAsync(path)

          Alert.alert(
            "Recording Saved",
            `Your ${
              selectedMode === "vertical"
                ? "9:16 vertical"
                : selectedMode === "horizontal"
                ? "16:9 horizontal"
                : "1:1 square"
            } video has been saved to your camera roll.`
          )
        },
        onRecordingError: (error) => {
          console.error("Recording error:", error)
          Alert.alert("Recording Error", "An error occurred while recording video.")
          setIsRecording(false)
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Failed to start recording:", error)
      Alert.alert("Error", "Failed to start recording")
      setIsRecording(false)
    }
  }, [selectedMode])

  const stopRecording = useCallback(async () => {
    if (!camera.current || !isRecording) return

    try {
      await camera.current.stopRecording()
      setIsRecording(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Failed to stop recording:", error)
      Alert.alert(`Failed to stop recording: ${errorMessage}`)
    }
  }, [isRecording])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, stopRecording, startRecording])

  const selectMode = useCallback(
    (mode: VideoMode) => {
      setSelectedMode(mode)

      if (camera.current) {
        if (isRecording) {
          camera.current.stopRecording().catch(console.error)
          setIsRecording(false)
        }

        setTimeout(() => {
          if (camera.current) {
            camera.current.forceUpdate?.()
          }
        }, 100)
      }
    },
    [camera, isRecording]
  )

  const controlsStyle = useMemo<ViewStyle>(() => {
    if (isLandscape) {
      return {
        position: "absolute",
        right: Math.max(10, insets.right),
        top: "50%",
        transform: [{ translateY: -75 }],
        flexDirection: "column",
        height: 150,
        width: "auto",
      }
    } else {
      return {
        position: "absolute",
        bottom: Math.max(10, insets.bottom),
        left: 0,
        right: 0,
      }
    }
  }, [isLandscape, insets.right, insets.bottom])

  const renderPermissionRequest = useCallback(() => {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.permissionText}>
          {hasPermission === false
            ? "Camera permission denied. Please grant permission in settings."
            : "Loading camera..."}
        </Text>
        {hasPermission === false && (
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Request Permission</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }, [hasPermission, requestPermission, insets.top, insets.bottom])

  const renderCameraContent = useCallback(() => {
    if (!device || !hasPermission) {
      return renderPermissionRequest()
    }

    return (
      <View style={styles.container}>
        <StatusBar hidden />

        <View style={styles.fullScreenPreviewContainer}>
          <Camera
            key={cameraKey}
            ref={camera}
            style={[
              styles.fullScreenCamera,
              {
                width: aspectRatio.width,
                height: aspectRatio.height,
              },
            ]}
            device={device}
            format={videoFormat}
            isActive={isActive}
            video={true}
            audio={false}
            enableZoomGesture
            onError={onCameraError}
          />

          {orientationGuidance ? (
            <View
              style={[
                styles.orientationGuidance,
                {
                  top: isLandscape ? 20 : Math.max(20, insets.top),
                  left: isLandscape ? Math.max(20, insets.left) : 0,
                  right: isLandscape ? Math.max(20, insets.right) : 0,
                },
              ]}
            >
              <Text style={styles.orientationText}>{orientationGuidance}</Text>
            </View>
          ) : null}

          {/* Recording Indicator */}
          {isRecording && (
            <View
              style={[
                styles.recordingIndicator,
                {
                  top: isLandscape ? 20 : Math.max(20, insets.top),
                  right: isLandscape ? aspectRatio.width - 70 : 20,
                },
              ]}
            >
              <Text style={styles.recordingText}>RECORDING</Text>
            </View>
          )}

          <View
            style={[
              styles.modeIndicator,
              {
                top: isLandscape
                  ? isRecording
                    ? 60
                    : 20
                  : Math.max(isRecording ? 60 : 20, insets.top + (isRecording ? 40 : 0)),
                right: isLandscape ? aspectRatio.width - 70 : 20,
              },
            ]}
          >
            <Text style={styles.modeIndicatorText}>
              {selectedMode === "vertical" ? "9:16" : selectedMode === "horizontal" ? "16:9" : "1:1"}
            </Text>
          </View>
        </View>

        <View style={[styles.controls, controlsStyle]}>
          <View style={[styles.modeSelection, isLandscape ? { marginBottom: 20 } : {}]}>
            {Object.entries(VIDEO_MODES).map(([mode, config]) => (
              <TouchableOpacity
                key={mode}
                style={[styles.modeButton, selectedMode === mode && styles.selectedMode]}
                onPress={() => selectMode(mode as VideoMode)}
              >
                <Text style={styles.modeText}>{config.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordingButton]}
            onPress={toggleRecording}
          >
            <Text style={styles.recordButtonText}>{isRecording ? "STOP" : "REC"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }, [
    device,
    hasPermission,
    renderPermissionRequest,
    aspectRatio,
    videoFormat,
    isActive,
    onCameraError,
    orientationGuidance,
    isLandscape,
    insets,
    isRecording,
    controlsStyle,
    selectedMode,
    selectMode,
    toggleRecording,
    cameraKey,
  ])

  return renderCameraContent()
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#000",
  },
  permissionText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  fullScreenPreviewContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenCamera: {
    position: "absolute",
  },
  controls: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modeSelection: {
    flexDirection: "row",
    marginBottom: 20,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 20,
    padding: 4,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 5,
    borderRadius: 14,
  },
  selectedMode: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  modeText: {
    color: "white",
    fontWeight: "600",
    fontSize: 13,
  },
  recordButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#ff3b30",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.7)",
  },
  recordingButton: {
    backgroundColor: "#ff4d4d",
    borderColor: "#fff",
  },
  recordButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  orientationGuidance: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 8,
    alignItems: "center",
    borderRadius: 12,
    zIndex: 5,
  },
  orientationText: {
    color: "white",
    fontWeight: "600",
    textAlign: "center",
    fontSize: 13,
  },
  recordingIndicator: {
    position: "absolute",
    backgroundColor: "rgba(255,0,0,0.8)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    zIndex: 5,
  },
  recordingText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
  button: {
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 1000,
  },
  errorContainer: {
    width: "80%",
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ff3b30",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "white",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  modeIndicator: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    zIndex: 5,
  },
  modeIndicatorText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
})
