const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

export async function onRequestPost({ request, env }) {
  if (!env.MEDIA) {
    return json(
      {
        error: 'storage_not_configured',
        message: 'Bind an R2 bucket as MEDIA in Cloudflare before using image-to-video uploads.',
      },
      { status: 503 },
    );
  }

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return json({ error: 'invalid_beta_code', message: 'The private beta access code is invalid.' }, { status: 401 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'invalid_form', message: 'Send the image as multipart form data.' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return json({ error: 'missing_image', message: 'Choose an image file first.' }, { status: 400 });
  }

  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) {
    return json({ error: 'unsupported_image', message: 'Use JPG, PNG, WEBP, or GIF.' }, { status: 415 });
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return json({ error: 'image_too_large', message: 'Image must be smaller than 12 MB.' }, { status: 413 });
  }

  const key = `${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      originalName: file.name.slice(0, 180),
      uploadedAt: new Date().toISOString(),
    },
  });

  const publicUrl = new URL(`/media/${key}`, request.url).toString();
  return json(
    {
      asset: {
        key,
        url: publicUrl,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      },
    },
    { status: 201 },
  );
}