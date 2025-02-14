import ESpeakNg from "espeak-ng";
import { langsMap, type LangId } from "$lib/shared/resources";

const ESPEAK_NG_WASM_URL =
  "https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.wasm";

/**
 * phonemize converts text to phonemes and returns
 * the phonemized text in the specified language.
 *
 * it uses espeak-ng to generate the phonemes.
 *
 * @param text
 * @param lang
 * @returns
 */
export async function phonemize(
  text: string,
  langId: LangId | string,
): Promise<string> {
  let lang = langsMap["en-us"];
  for (const key of Object.keys(langsMap)) {
    if (key === langId) {
      lang = langsMap[langId as LangId];
      break;
    }
  }

  text = normalizeText(text);
  text = text.replaceAll('"', '\\"');

  const espeak = await ESpeakNg({
    locateFile: (_: string) => ESPEAK_NG_WASM_URL,
    arguments: [
      "--phonout",
      "generated",
      "-q",
      `--ipa`,
      "-v",
      lang.espeakLang,
      text,
    ],
  });

  const generated = espeak.FS.readFile("generated", { encoding: "utf8" });
  return generated.split("\n").join(" ").trim();
}

/**
 * normalizeText normalizes text to be phonemized.
 *
 * @param text The text to normalize.
 */
function normalizeText(text: string): string {
  return (
    text
      // Quotes and parentheses
      .replaceAll("‘", "'")
      .replaceAll("’", "'")
      .replaceAll("«", "(")
      .replaceAll("»", ")")
      .replaceAll("“", '"')
      .replaceAll("”", '"')
      // Punctuation
      .replace(/、/g, ", ")
      .replace(/。/g, ". ")
      .replace(/！/g, "! ")
      .replace(/，/g, ", ")
      .replace(/：/g, ": ")
      .replace(/；/g, "; ")
      .replace(/？/g, "? ")
      // Spaces
      .replaceAll("\n", "  ")
      .replaceAll("\t", "  ")
      .trim()
  );
}
