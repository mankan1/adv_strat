#!/bin/bash

echo "🚀 Installing Options Scanner Frontend..."
echo "=========================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current: $NODE_VERSION"
    exit 1
fi
echo "✅ Node.js v$(node -v)"

# Check if Expo CLI is installed
if ! command -v expo &> /dev/null; then
    echo "📦 Installing Expo CLI globally..."
    npm install -g expo-cli
fi
echo "✅ Expo CLI installed"

# Install dependencies
echo "📦 Installing project dependencies..."
npm install

# Install Expo packages
echo "📦 Installing required Expo packages..."
npx expo install expo-splash-screen expo-font expo-linear-gradient
npx expo install react-native-screens react-native-safe-area-context
npx expo install react-native-gesture-handler react-native-reanimated
npx expo install react-native-svg

# Create assets directory if not exists
mkdir -p assets

echo ""
echo "✅ Frontend installation complete!"
echo ""
echo "🚀 To start the frontend:"
echo "   npm start        # Start Expo dev server"
echo "   npm run web      # Run in web browser"
echo "   npm run android  # Run on Android"
echo "   npm run ios      # Run on iOS"
echo ""
echo "🌐 Web version will open at: https://advstrat-production.up.railway.app"
echo ""
echo "⚠️  IMPORTANT: Make sure the backend is running at https://advstrat-production.up.railway.app"
