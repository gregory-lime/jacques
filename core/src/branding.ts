/**
 * Endearment phrases displayed before "Jacques" in the CLI header.
 * A random phrase is selected on each app startup.
 */

export const ENDEARMENT_PHRASES = [
  "My Dearest",
  "My sweet",
  "My love",
  "My sunshine",
  "My precious",
  "My lambkin",
  "My kitten",
  "My honeybunny",
  "My cupcake",
  "My pookie",
  "My boo",
  "My sweetling",
  "Mi amor",
  "Mój kochany",
  "Mi cariño",
  "Mio amore",
  "Mon chéri",
  "Mon petit chou",
  "Mein Schatz",
  "Mein Liebling",
  "Habibi",
  "Azizam",
  "Meri jaan",
  "Amar shona",
  "Meri priya",
  "Meu carinho",
  "Moya dusya",
  "Wǒ de xīn gān",
  "Watashi no hime",
  "Nae sarang",
  "En uyire",
  "Cintaku",
  "Mahal ko",
  "Con mèo con của tôi",
  "Prana-priya",
  "Nyan-nyan",
  "Kame-chan",
  "Manisanku",
];

export function getRandomEndearment(): string {
  return ENDEARMENT_PHRASES[Math.floor(Math.random() * ENDEARMENT_PHRASES.length)];
}

/** Selected once at module load (app startup). Same value for the entire process lifetime. */
export const APP_ENDEARMENT = getRandomEndearment();
