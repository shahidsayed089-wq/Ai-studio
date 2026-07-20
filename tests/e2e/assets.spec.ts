import { test, expect } from "@playwright/test";
import { call, createProject, newApi, payload, register } from "./helpers";

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0]);

test("R2 upload, private download and deletion persist through the API", async () => {
  const api = await newApi("r2-owner"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const upload = await payload<{ asset: { id: string } }>(await call(api, "/api/v1/assets", { method: "POST", cookie: account.cookie, headers: { "Content-Type": "image/png", "Content-Length": String(png.length), "X-File-Name": "../../unsafe launch.png", "X-Project-Id": projectId }, data: png }));
  expect(upload.response.status(), JSON.stringify(upload.body)).toBe(201);
  const download = await call(api, `/api/v1/assets/${upload.body.asset.id}/content`, { cookie: account.cookie });
  expect(download.status()).toBe(200);
  expect(Buffer.from(await download.body())).toEqual(png);
  expect(download.headers()["cache-control"]).toContain("private");
  expect((await call(api, `/api/v1/assets/${upload.body.asset.id}`, { method: "DELETE", cookie: account.cookie })).status()).toBe(204);
  expect((await call(api, `/api/v1/assets/${upload.body.asset.id}/content`, { cookie: account.cookie })).status()).toBe(404);
  await api.dispose();
});

test("cross-user asset download and deletion are rejected", async () => {
  const ownerApi = await newApi("asset-owner"); const strangerApi = await newApi("asset-stranger");
  const owner = await register(ownerApi); const stranger = await register(strangerApi); const projectId = await createProject(ownerApi, owner.cookie);
  const upload = await payload<{ asset: { id: string } }>(await call(ownerApi, "/api/v1/assets", { method: "POST", cookie: owner.cookie, headers: { "Content-Type": "image/png", "Content-Length": String(png.length), "X-File-Name": "isolation.png", "X-Project-Id": projectId }, data: png }));
  expect((await call(strangerApi, `/api/v1/assets/${upload.body.asset.id}/content`, { cookie: stranger.cookie })).status()).toBe(404);
  expect((await call(strangerApi, `/api/v1/assets/${upload.body.asset.id}`, { method: "DELETE", cookie: stranger.cookie })).status()).toBe(404);
  expect((await call(ownerApi, `/api/v1/assets/${upload.body.asset.id}/content`, { cookie: owner.cookie })).status()).toBe(200);
  await ownerApi.dispose(); await strangerApi.dispose();
});
