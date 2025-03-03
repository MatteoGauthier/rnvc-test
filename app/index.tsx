import { useAppState } from "@react-native-community/hooks"
import { useNavigation } from "expo-router"
import * as ScreenOrientation from "expo-screen-orientation"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Dimensions, StatusBar, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Camera,
  CameraDevice,
  CameraRuntimeError,
  PhotoFile,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  VideoFile,
} from "react-native-vision-camera"
import * as MediaLibrary from "expo-media-library"

// Define video modes with their aspect ratios for better type safety
type VideoMode = "vertical" | "horizontal" | "square"

interface AspectRatio {
  width: number
  height: number
}

interface VideoModeConfig {
  name: string
  portraitRatio: number
  landscapeRatio: number
}

// Constants for different video modes
const VIDEO_MODES: Record<VideoMode, VideoModeConfig> = {
  vertical: {
    name: "Vertical",
    portraitRatio: 16 / 9, // height/width in portrait
    landscapeRatio: 9 / 16, // width/height in landscape
  },
  horizontal: {
    name: "Horizontal",
    portraitRatio: 9 / 16, // height/width in portrait
    landscapeRatio: 16 / 9, // width/height in landscape
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
  const [error, setError] = useState<string | null>(null)

  const navigation = useNavigation()
  const isFocused = navigation.isFocused()
  const appState = useAppState()
  const isActive = isFocused && appState === "active"

  // Get safe area insets
  const insets = useSafeAreaInsets()

  const camera = useRef<Camera>(null)
  const device = useCameraDevice("back")

  // Configure camera format for Full HD (1920x1080) at 30fps
  const format = useCameraFormat(device, [{ videoResolution: { width: 1920, height: 1080 } }, { fps: 30 }])

  // Check if orientation is landscape
  const isLandscape = useMemo(() => {
    return (
      deviceOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
      deviceOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
    )
  }, [deviceOrientation])

  // Check if orientation is portrait
  const isPortrait = useMemo(() => {
    return (
      deviceOrientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
      deviceOrientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
    )
  }, [deviceOrientation])

  // Get the proper aspect ratio based on selected mode and orientation
  const getAspectRatio = useCallback((): AspectRatio => {
    const screenWidth = Dimensions.get("window").width
    const screenHeight = Dimensions.get("window").height
    const modeConfig = VIDEO_MODES[selectedMode]

    if (isLandscape) {
      if (selectedMode === "vertical") {
        // In landscape, fill the height and calculate width based on 9:16 ratio
        return {
          width: screenHeight * modeConfig.landscapeRatio,
          height: screenHeight,
        }
      } else if (selectedMode === "horizontal") {
        // In landscape, maintain 16:9 ratio
        // Calculate both options and use the one that fits better
        const widthConstrainedHeight = screenWidth / modeConfig.landscapeRatio
        const heightConstrainedWidth = screenHeight * modeConfig.landscapeRatio

        // If using width as constraint would exceed screen height, use height as constraint
        if (widthConstrainedHeight > screenHeight) {
          return {
            width: heightConstrainedWidth,
            height: screenHeight,
          }
        } else {
          // Otherwise use width as constraint
          return {
            width: screenWidth,
            height: widthConstrainedHeight,
          }
        }
      } else {
        // Square: use height as the constraint
        return {
          width: screenHeight,
          height: screenHeight,
        }
      }
    } else {
      // Portrait mode
      if (selectedMode === "vertical") {
        // In portrait, fill the width and calculate height based on 9:16 ratio
        return {
          width: screenWidth,
          height: screenWidth * modeConfig.portraitRatio,
        }
      } else if (selectedMode === "horizontal") {
        // In portrait, fill the width and calculate height based on 16:9 ratio
        return {
          width: screenWidth,
          height: screenWidth * modeConfig.portraitRatio,
        }
      } else {
        // Square: use width as the constraint
        return {
          width: screenWidth,
          height: screenWidth,
        }
      }
    }
  }, [selectedMode, isLandscape])

  // Memoize the aspect ratio to prevent recalculation on every render
  const aspectRatio = useMemo(() => getAspectRatio(), [getAspectRatio])

  // Check and request camera permissions
  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch((err) => {
        console.error("Failed to request permission:", err)
        setError("Failed to request camera permission")
      })
    }
  }, [hasPermission, requestPermission])

  // Enable and monitor screen orientation changes
  useEffect(() => {
    let subscription: ScreenOrientation.Subscription | undefined

    const setupOrientation = async () => {
      try {
        // Allow all orientations
        await ScreenOrientation.unlockAsync()

        // Add orientation change listener
        subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
          console.log("Orientation changed:", orientationInfo.orientation)
          setDeviceOrientation(orientationInfo.orientation)

          // Force re-render of camera
          if (camera.current) {
            camera.current.forceUpdate?.()
          }
        })

        // Get current orientation
        const currentOrientation = await ScreenOrientation.getOrientationAsync()
        console.log("Current orientation:", currentOrientation)
        setDeviceOrientation(currentOrientation)
      } catch (err) {
        console.error("Failed to setup orientation:", err)
        setError("Failed to configure device orientation")
      }
    }

    setupOrientation()

    // Cleanup
    return () => {
      if (subscription) {
        ScreenOrientation.removeOrientationChangeListener(subscription)
      }
      // Lock back to portrait on unmount
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(console.error)
    }
  }, [])

  // Get orientation guidance based on selected mode and current orientation
  const getOrientationGuidance = useCallback((): string => {
    switch (selectedMode) {
      case "vertical":
        if (!isPortrait) {
          return "Rotate to portrait for optimal vertical video"
        }
        break
      case "horizontal":
        if (!isLandscape) {
          return "Rotate to landscape for optimal horizontal video"
        }
        break
      case "square":
        // Square mode works well in any orientation
        return ""
    }
    return ""
  }, [selectedMode, isPortrait, isLandscape])

  // Memoize the guidance to prevent recalculation on every render
  const orientationGuidance = useMemo(() => getOrientationGuidance(), [getOrientationGuidance])

  // Handle camera errors
  const onCameraError = useCallback((error: CameraRuntimeError) => {
    console.error(`Camera error: ${error.code}`, error.message)
    setError(`Camera error: ${error.message}`)
  }, [])

  // Start recording video
  const startRecording = useCallback(async () => {
    if (!camera.current) return

    setIsRecording(true)
    try {
      camera.current.startRecording({
        fileType: "mp4",
        onRecordingFinished: async (video: VideoFile) => {
          console.log("Recording finished:", video)
          // Here you can handle the recorded video for post-processing
          const path = video.path
          MediaLibrary.saveToLibraryAsync(path)
        },
        onRecordingError: (error) => {
          console.error("Recording error:", error)
          Alert.alert("Recording Error", "An error occurred while recording video.")
          setIsRecording(false)
          setError(`Recording error: ${error.message}`)
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Failed to start recording:", error)
      Alert.alert("Error", "Failed to start recording")
      setIsRecording(false)
      setError(`Failed to start recording: ${errorMessage}`)
    }
  }, [])

  // Stop recording video
  const stopRecording = useCallback(async () => {
    if (!camera.current || !isRecording) return

    try {
      await camera.current.stopRecording()
      setIsRecording(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Failed to stop recording:", error)
      setError(`Failed to stop recording: ${errorMessage}`)
    }
  }, [isRecording])

  // Toggle recording state
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, stopRecording, startRecording])

  // Select video mode
  const selectMode = useCallback(
    (mode: VideoMode) => {
      setSelectedMode(mode)
      // Force camera update when mode changes
      setTimeout(() => {
        if (camera.current) {
          camera.current.forceUpdate?.()
        }
      }, 100)
    },
    [camera]
  )

  // Calculate dynamic styles for controls based on orientation
  const getControlsStyle = useCallback((): ViewStyle => {
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

  // Memoize the controls style to prevent recalculation on every render
  const controlsStyle = useMemo(() => getControlsStyle(), [getControlsStyle])

  // Render permission request screen
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
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    )
  }, [hasPermission, requestPermission, insets.top, insets.bottom, error])

  // Render camera content only when we have permissions and the screen is focused
  const renderCameraContent = useCallback(() => {
    if (!device || !hasPermission) {
      return renderPermissionRequest()
    }

    return (
      <View style={styles.container}>
        <StatusBar hidden />

        {/* Full Screen Camera Preview */}
        <View style={styles.fullScreenPreviewContainer}>
          <Camera
            ref={camera}
            style={[
              styles.fullScreenCamera,
              {
                width: aspectRatio.width,
                height: aspectRatio.height,
              },
            ]}
            device={device}
            format={format}
            isActive={isActive}
            video={true}
            audio={false}
            enableZoomGesture
            onError={onCameraError}
          />

          {/* Orientation Guidance */}
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
        </View>

        {/* Controls - Positioned at bottom with safe area padding */}
        <View style={[styles.controls, controlsStyle]}>
          {/* Mode Selection */}
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

          {/* Record Button */}
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordingButton]}
            onPress={toggleRecording}
          >
            <Text style={styles.recordButtonText}>{isRecording ? "STOP" : "REC"}</Text>
          </TouchableOpacity>
        </View>

        {/* Error message if any */}
        {error && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        )}
      </View>
    )
  }, [
    device,
    hasPermission,
    renderPermissionRequest,
    aspectRatio,
    format,
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
    error,
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
})
