/**
 * Tests for AppleScript utilities
 */

import { escapeAppleScript, isAppleScriptAvailable } from './applescript.js';

describe('escapeAppleScript', () => {
  it('escapes single quotes', () => {
    const input = "tell app 'Finder' to activate";
    const escaped = escapeAppleScript(input);
    expect(escaped).toBe("tell app '\\''Finder'\\'' to activate");
  });

  it('handles multiple single quotes', () => {
    const input = "'one' 'two' 'three'";
    const escaped = escapeAppleScript(input);
    expect(escaped).toBe("'\\''one'\\'' '\\''two'\\'' '\\''three'\\''");
  });

  it('returns unchanged string without quotes', () => {
    const input = 'tell application "System Events" to return name';
    const escaped = escapeAppleScript(input);
    expect(escaped).toBe(input);
  });

  it('handles empty string', () => {
    expect(escapeAppleScript('')).toBe('');
  });

  it('handles string with only single quote', () => {
    expect(escapeAppleScript("'")).toBe("'\\''");
  });

  it('handles multiline scripts', () => {
    const script = `tell application "iTerm2"
      repeat with w in windows
        if name of w is 'Main' then
          return "found"
        end if
      end repeat
    end tell`;
    const escaped = escapeAppleScript(script);
    // The single quotes around 'Main' should be escaped
    expect(escaped).toContain("'\\''Main'\\''");
    // Original unescaped pattern should not appear
    expect(escaped).not.toContain(" 'Main' ");
  });

  it('handles consecutive single quotes', () => {
    expect(escapeAppleScript("''")).toBe("'\\'''\\''");
  });

  it('handles quotes at start and end', () => {
    expect(escapeAppleScript("'test'")).toBe("'\\''test'\\''");
  });
});

describe('isAppleScriptAvailable', () => {
  it('returns boolean based on platform', () => {
    const result = isAppleScriptAvailable();
    expect(typeof result).toBe('boolean');
    // On macOS it should be true, on other platforms false
    if (process.platform === 'darwin') {
      expect(result).toBe(true);
    } else {
      expect(result).toBe(false);
    }
  });
});

// Note: runAppleScript is tested implicitly through integration tests
// since it requires actual osascript execution. Unit tests would need
// mocking which adds complexity without much value for this simple wrapper.
