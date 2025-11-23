from PIL import Image
import numpy as np

def remove_white_background(input_path, output_path, threshold=240):
    img = Image.open(input_path).convert("RGBA")
    data = np.array(img)

    # Get RGB values
    r, g, b, a = data.T

    # Identify white pixels (all channels > threshold)
    white_areas = (r > threshold) & (g > threshold) & (b > threshold)

    # Set alpha to 0 for white pixels
    data[..., 3][white_areas.T] = 0

    # Save result
    result = Image.fromarray(data)
    result.save(output_path)
    print(f"Saved transparent image to {output_path}")

if __name__ == "__main__":
    remove_white_background("public/assets/logo-flags.png", "public/assets/logo-flags-transparent.png")
