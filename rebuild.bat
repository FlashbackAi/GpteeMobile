@echo off
echo Killing Metro bundler...
taskkill /F /IM node.exe 2>nul

echo Clearing Metro cache...
rd /s /q %TEMP%\metro-* 2>nul
rd /s /q %TEMP%\haste-map-* 2>nul

echo Clearing React Native cache...
rd /s /q %TEMP%\react-native-* 2>nul

echo Cleaning Android build...
cd android
call gradlew clean
cd ..

echo Clearing node_modules cache...
del /q /s node_modules\.cache 2>nul

echo Starting Metro bundler with clean cache...
start "Metro" cmd /k "npx react-native start --reset-cache"

echo Waiting 5 seconds for Metro to start...
timeout /t 5

echo Building and installing app...
npx react-native run-android

echo Done!
