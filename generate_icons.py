import os
from PIL import Image, ImageDraw, ImageFont

def create_icon(size):
    # Create an image with RGBA channel for transparency
    img = Image.new('RGBA', (size, size), color=(0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Define color scheme (neon purple to glowing cyan gradient)
    padding = max(1, size // 10)
    box = [padding, padding, size - padding, size - padding]
    
    # Draw futuristic outer ring with carbon dark center
    draw.ellipse(box, fill=(11, 8, 20, 255), outline=(139, 92, 246, 255), width=max(1, size // 16))
    
    # Draw secondary glowing accent arc/circle
    inner_padding = padding + max(1, size // 8)
    inner_box = [inner_padding, inner_padding, size - inner_padding, size - inner_padding]
    draw.ellipse(inner_box, outline=(6, 182, 212, 100), width=max(1, size // 24))
    
    # Draw letter 'N' in center
    try:
        # Try to use standard sans-serif font, otherwise use default
        font_size = int(size * 0.45)
        # Attempt to load a default Windows font
        font = ImageFont.truetype("arial.ttf", font_size)
    except IOError:
        font = ImageFont.load_default()
        
    text = "N"
    
    # Calculate text dimensions to center it
    try:
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]
    except AttributeError:
        # Fallback for older Pillow versions
        text_w, text_h = draw.textsize(text, font=font)
        
    x = (size - text_w) // 2
    y = (size - text_h) // 2 - max(1, size // 16) # slight vertical adjustment
    
    # Draw glowing text in center
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    
    # Ensure output directory exists
    os.makedirs('icons', exist_ok=True)
    img.save(f'icons/icon{size}.png', 'PNG')
    print(f"Generated icons/icon{size}.png")

if __name__ == "__main__":
    for s in [16, 48, 128]:
        create_icon(s)
