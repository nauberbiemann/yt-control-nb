"""Quick test: try generating a single image with gemini-2.5-flash"""
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os

load_dotenv()
client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

print('Testing gemini-2.5-flash for image generation...', flush=True)
try:
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents='Generate an image: A simple cartoon stick figure with a round white head and spiky orange hair, looking surprised, on a light blue background. Simple webcomic style with bold outlines.',
        config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE']),
    )
    for part in response.candidates[0].content.parts:
        if hasattr(part, 'inline_data') and part.inline_data is not None:
            img = part.as_image()
            img.save('test_image.png')
            size = os.path.getsize('test_image.png')
            print(f'SUCCESS! Image saved: {size} bytes', flush=True)
        elif hasattr(part, 'text') and part.text:
            print(f'Text response: {part.text[:200]}', flush=True)
except Exception as e:
    print(f'Error: {e}', flush=True)

# Also test gemini-2.5-flash-image-generation
print('\nTesting gemini-2.5-flash-image...', flush=True)
try:
    response2 = client.models.generate_content(
        model='gemini-2.5-flash-image',
        contents='Generate an image: A cartoon stick figure with round white head and spiky hair looking confused, pastel blue background, webcomic style',
    )
    for part in response2.candidates[0].content.parts:
        if hasattr(part, 'inline_data') and part.inline_data is not None:
            img = part.as_image()
            img.save('test_image2.png')
            size = os.path.getsize('test_image2.png')
            print(f'SUCCESS! Image2 saved: {size} bytes', flush=True)
        elif hasattr(part, 'text') and part.text:
            print(f'Text response: {part.text[:200]}', flush=True)
except Exception as e:
    print(f'Error: {e}', flush=True)
