import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = join(dirname(modulePath), "..");
const ENTRY_FILES = Object.freeze(["index.html", "learning.html", "create.html", "works.html", "privacy.html"]);
const CLEARED_MARKERS = Object.freeze(["authorized-student-work-release", "guardian-media-release"]);

function comparable(value) {
  return JSON.stringify(value);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function readRequired(path, label) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`);
  return readFileSync(path, "utf8");
}

function currentWorks(root) {
  const html = readRequired(join(root, "works.html"), "works center");
  const rows = [...html.matchAll(/<article class="work-row">([\s\S]*?)<\/article>/gu)];
  return rows.map((match) => {
    const row = match[1];
    const title = row.match(/<h3 class="work-title">([^<]+)<\/h3>/u)?.[1]?.trim();
    const publicUrl = row.match(/<a class="work-cover" href="([^"]+)"/u)?.[1];
    const coverPath = row.match(/<img src="([^"]+)"/u)?.[1];
    if (!title || !publicUrl || !coverPath) throw new Error("A works-center row is missing its title, URL, or cover");
    return { title, publicUrl, coverPath };
  });
}

function currentMedia(root) {
  const paths = [];
  for (const file of ENTRY_FILES) {
    const html = readRequired(join(root, file), file);
    for (const match of html.matchAll(/<source src="(assets\/media\/[^"]+\.mp4)"/gu)) paths.push(match[1]);
  }
  return uniqueSorted(paths);
}

export function assertPublicationAuthorization({ root = defaultRoot } = {}) {
  const manifestPath = join(root, "release/publication-authorization-manifest.json");
  const manifest = JSON.parse(readRequired(manifestPath, "publication authorization manifest"));
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported publication authorization manifest schema");
  if (manifest.attestation?.studentAssentConfirmed !== true) {
    throw new Error("Publication authorization is missing student assent confirmation");
  }
  if (manifest.attestation?.guardianAuthorizationConfirmed !== true) {
    throw new Error("Publication authorization is missing guardian confirmation");
  }

  const works = currentWorks(root);
  if (works.length !== 10) throw new Error(`Expected 10 works-center entries, found ${works.length}`);
  if (comparable(works) !== comparable(manifest.works)) {
    throw new Error("The works center no longer matches the publication authorization manifest");
  }

  const listedMedia = uniqueSorted((manifest.media || []).map((item) => item.sourcePath));
  const referencedMedia = currentMedia(root);
  if (comparable(listedMedia) !== comparable(referencedMedia)) {
    throw new Error("Student media references no longer match the publication authorization manifest");
  }

  for (const work of manifest.works) {
    if (!existsSync(join(root, work.coverPath))) throw new Error(`Authorized work cover is missing: ${work.coverPath}`);
  }
  for (const media of manifest.media) {
    for (const path of [media.sourcePath, media.posterPath]) {
      if (!existsSync(join(root, path))) throw new Error(`Authorized media asset is missing: ${path}`);
    }
    for (const slot of media.slots || []) {
      const html = readRequired(join(root, slot), slot);
      if (!html.includes(media.sourcePath) || !html.includes(media.posterPath)) {
        throw new Error(`${slot} no longer contains the authorized media and poster pair for ${media.sourcePath}`);
      }
    }
  }

  for (const file of ENTRY_FILES) {
    const html = readRequired(join(root, file), file);
    for (const marker of CLEARED_MARKERS) {
      if (html.includes(`data-launch-required="${marker}"`)) {
        throw new Error(`${file} still contains a cleared publication authorization marker: ${marker}`);
      }
    }
  }

  return { mediaCount: manifest.media.length, workCount: manifest.works.length };
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const result = assertPublicationAuthorization();
  console.log(`Publication authorization check passed: ${result.workCount} works; ${result.mediaCount} media assets.`);
}
