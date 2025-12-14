#!/bin/bash

echo "🎨 Creating placeholder assets..."

mkdir -p assets

# Create simple placeholder images using ImageMagick or fallback to downloads
if command -v convert &> /dev/null; then
    # Using ImageMagick
    echo "Creating icon (1024x1024)..."
    convert -size 1024x1024 gradient:#1a1a2e-#0f3460 -fill white -pointsize 200 -gravity center -annotate 0 "OS" assets/icon.png
    
    echo "Creating splash screen (1242x2436)..."
    convert -size 1242x2436 gradient:#1a1a2e-#16213e -fill white -pointsize 100 -gravity center -annotate 0 "Options\nScanner" assets/splash.png
    
    echo "Creating adaptive icon (1024x1024)..."
    convert -size 1024x1024 gradient:#1a1a2e-#0f3460 -fill white -pointsize 200 -gravity center -annotate 0 "OS" -transparent black assets/adaptive-icon.png
    
    echo "Creating favicon (32x32)..."
    convert -size 32x32 gradient:#1a1a2e-#0f3460 -fill white -pointsize 12 -gravity center -annotate 0 "OS" assets/favicon.png
    
    echo "✅ Assets created successfully!"
else
    echo "⚠️ ImageMagick not found. Creating text files as placeholders..."
    echo "Placeholder icon" > assets/icon.png
    echo "Placeholder splash" > assets/splash.png
    echo "Placeholder adaptive icon" > assets/adaptive-icon.png
    echo "Placeholder favicon" > assets/favicon.png
    echo "✅ Text placeholder assets created. Replace with actual images."
fi

echo ""
echo "📁 Assets created in: assets/"
ls -la assets/
