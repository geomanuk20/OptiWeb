import base64
import io
import json
import os
import zipfile
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from PIL import Image


def index(request):
    """Render the main converter application dashboard."""
    return render(request, 'converter/index.html')


@csrf_exempt
def convert_image(request):
    """
    Handle single image conversion.
    Accepts:
        - image: File in request.FILES
        - quality: WebP quality setting (1-100, default 80)
        - lossless: Whether to use lossless compression (true/false)
    Returns:
        JSON response with base64 converted WebP, sizes, and savings percentage.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method is allowed'}, status=405)

    uploaded_file = request.FILES.get('image')
    if not uploaded_file:
        return JsonResponse({'error': 'No image file uploaded'}, status=400)

    # Get settings
    try:
        quality = int(request.POST.get('quality', 80))
        quality = max(1, min(100, quality))
    except ValueError:
        quality = 80

    lossless = request.POST.get('lossless', 'false').lower() == 'true'

    # Get file stats
    original_size = uploaded_file.size
    original_name = uploaded_file.name
    filename_without_ext, _ = os.path.splitext(original_name)

    try:
        # Load the uploaded image into Pillow
        img_bytes = uploaded_file.read()
        uploaded_file.seek(0)
        img = Image.open(io.BytesIO(img_bytes))

        # Convert original to base64 for frontend comparison slider
        original_base64 = base64.b64encode(img_bytes).decode('utf-8')
        fmt = getattr(img, 'format', 'PNG')
        if not fmt:
            fmt = 'PNG'
        fmt = fmt.lower()
        if fmt == 'jpg':
            fmt = 'jpeg'
        original_data_url = f"data:image/{fmt};base64,{original_base64}"

        # Initialize stream for the output WebP
        webp_io = io.BytesIO()

        # Handle animations (e.g., animated GIFs)
        if getattr(img, 'is_animated', False) and getattr(img, 'n_frames', 1) > 1:
            frames = []
            for frame_idx in range(img.n_frames):
                img.seek(frame_idx)
                # Copy the frame to keep in memory and preserve transparency/mode
                frames.append(img.copy())
            img.seek(0)

            # Save animated WebP
            frames[0].save(
                webp_io,
                format='WEBP',
                save_all=True,
                append_images=frames[1:],
                quality=quality,
                lossless=lossless,
                loop=img.info.get('loop', 0),
                duration=img.info.get('duration', 100),
                minimize_size=True
            )
        else:
            # Handle static image
            # Ensure standard formats are handled. If mode is not compatible with WebP (like P or CMYK),
            # convert to RGBA if transparent, or RGB otherwise.
            if img.mode == 'CMYK':
                img = img.convert('RGB')
            elif img.mode == 'P':
                # Convert palette mode to RGBA to preserve transparency if it exists
                if 'transparency' in img.info:
                    img = img.convert('RGBA')
                else:
                    img = img.convert('RGB')

            # Save WebP
            img.save(
                webp_io,
                format='WEBP',
                quality=quality,
                lossless=lossless,
                method=4  # Speed/quality trade-off (4 is default, 6 is max compression but slower)
            )

        webp_data = webp_io.getvalue()
        webp_size = len(webp_data)

        # Calculate savings
        savings_bytes = original_size - webp_size
        savings_percent = 0.0
        if original_size > 0:
            savings_percent = round((savings_bytes / original_size) * 100, 1)

        # Base64 encode the output WebP
        webp_base64 = base64.b64encode(webp_data).decode('utf-8')
        webp_data_url = f"data:image/webp;base64,{webp_base64}"

        return JsonResponse({
            'success': True,
            'filename': f"{filename_without_ext}.webp",
            'original_size': original_size,
            'webp_size': webp_size,
            'savings_percent': savings_percent,
            'original_data_url': original_data_url,
            'webp_data_url': webp_data_url,
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f"Failed to process image: {str(e)}"
        }, status=500)


@csrf_exempt
def download_zip(request):
    """
    Generate an in-memory ZIP archive from a list of base64-encoded files.
    Accepts:
        JSON body with { 'files': [ { 'name': 'file.webp', 'data': 'base64_data_url...' }, ... ] }
    Returns:
        ZIP file download response.
    """
    if request.method != 'POST':
        return HttpResponse('Method Not Allowed', status=405)

    try:
        data = json.loads(request.body)
        files = data.get('files', [])

        if not files:
            return HttpResponse('No files provided', status=400)

        # Create an in-memory zip file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for file_info in files:
                name = file_info.get('name')
                data_url = file_info.get('data', '')

                if not name or not data_url.startswith('data:image/webp;base64,'):
                    continue

                # Strip data URL prefix to get the raw base64 string
                base64_data = data_url.split(',')[1]
                file_bytes = base64.b64decode(base64_data)

                # Write bytes directly to zip
                zip_file.writestr(name, file_bytes)

        # Seek to beginning of buffer
        zip_buffer.seek(0)

        response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = 'attachment; filename="optimized_images.zip"'
        return response

    except Exception as e:
        return HttpResponse(f'Error creating ZIP archive: {str(e)}', status=500)
