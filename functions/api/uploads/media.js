const LIMITS = {
  image: 12 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

const TYPES = new Map([
  ['image/jpeg', { kind: 'image', extension: 'jpg' }],
  ['image/png', { kind: 'image', extension: 'png' }],
  ['image/webp', { kind: 'image', extension: 'webp' }],
  ['image/gif', { kind: 'image', extension: 'gif' }],
  ['video/mp4', { kind: 'video', extension: 'mp4' }],
  ['audio/mpeg', { kind: 'audio', extension: 'mp3' }],
  ['audio/mp3', { kind: 'audio', extension: 'mp3' }],
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
        message: 'Bind an R2 bucket as MEDIA before uploading Seedance reference files.',
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
    return json({ error: 'invalid_form', message: 'Send the file as multipart form data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return json({ error: 'missing_file', message: 'Choose a reference file first.' }, { status: 400 });
  }

  const descriptor = TYPES.get(file.type);
  if (!descriptor) {
    return json(
      {
        error: 'unsupported_media',
        message: 'Use JPG, PNG, WEBP, GIF, MP4 video, or MP3 audio.',
      },
      { status: 415 },
    );
  }

  const maxBytes = LIMITS[descriptor.kind];
  if (file.size <= 0 || file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / 1024 / 1024);
    return json(
      {
        error: 'media_too_large',
        message: `${descriptor.kind} file must be smaller than ${maxMb} MB.`,
      },
      { status: 413 },
    );
  }

  const key = `${crypto.randomUUID()}.${descriptor.extension}`;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      kind: descriptor.kind,
      originalName: file.name.slice(0, 180),
      uploadedAt: new Date().toISOString(),
    },
  });

  const publicUrl = new URL(`/media/${key}`, request.url).toString();
  return json(
    {
      asset: {
        key,
        kind: descriptor.kind,
        url: publicUrl,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      },
    },
    { status: 201 },
  );
}
