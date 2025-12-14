#!/bin/bash

echo "🔧 Fixing Expo dependencies..."
echo "================================="

# Clean up
echo "🧹 Cleaning node_modules..."
rm -rf node_modules package-lock.json

# Install correct versions
echo "📦 Installing dependencies..."
npm install

# Install specific expo-font version that works
echo "📦 Fixing expo-font..."
npx expo install expo-font@11.4.0

# Install other required packages
echo "📦 Installing required packages..."
npx expo install expo-splash-screen@0.20.5
npx expo install expo-linear-gradient@12.3.0
npx expo install expo-web-browser@12.3.1
npx expo install react-native-web@~0.19.6

# Install navigation packages
echo "📦 Installing navigation..."
npx expo install @react-navigation/native@^6.1.7
npx expo install react-native-screens@~3.22.0
npx expo install react-native-safe-area-context@4.6.3
npx expo install react-native-gesture-handler@~2.12.0

# Install other UI packages
npx expo install react-native-reanimated@~3.3.0
npx expo install react-native-svg@13.9.0
npx expo install react-native-vector-icons@^10.0.0

echo ""
echo "✅ Dependencies fixed!"
echo ""
echo "🚀 To start the app:"
echo "   npm run web        # For web development"
echo "   npm start          # For all platforms"
