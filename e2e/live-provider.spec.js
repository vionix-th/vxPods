import { test, expect } from '@playwright/test';
import { loadLiveProviderTargets } from '../tests/live/provider-targets.js';

const enabled = process.env.VXPODS_LIVE_PROVIDER === '1';
const targets = enabled ? loadLiveProviderTargets({ required: true }) : [];
const textCases = targets.flatMap((target) => target.textGeneration.map((testCase) => ({ target, testCase })));
const speechCases = targets.flatMap((target) => target.speech.flatMap((testCase) =>
  testCase.voices.map((voice) => ({ target, testCase, voice }))));

test.describe('live browser provider compatibility', () => {
  test.describe.configure({ mode: 'serial' });

  if (!enabled) {
    test.skip('requires npm run test:live', () => {});
    return;
  }

  for (const { target, testCase } of textCases) {
    test(`${target.name} · ${testCase.api} · ${testCase.model} passes CORS and returns text`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate(async ({ target, testCase }) => {
        const path = testCase.api === 'responses' ? '/responses' : '/chat/completions';
        const body = testCase.api === 'responses'
          ? {
              model: testCase.model,
              input: [{ role: 'user', content: testCase.input }],
              store: false,
            }
          : {
              model: testCase.model,
              messages: [{ role: 'user', content: testCase.input }],
              temperature: 0,
              store: false,
            };
        try {
          const response = await fetch(`${target.baseUrl}${path}`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${target.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          const contentType = response.headers.get('content-type') || '';
          const requestId = response.headers.get('x-request-id')
            || response.headers.get('x-generation-id')
            || response.headers.get('cf-ray');
          const responseText = await response.text();
          if (!response.ok) {
            return {
              ok: false,
              phase: 'http',
              status: response.status,
              contentType,
              requestId,
              detail: responseText.slice(0, 500),
            };
          }
          let payload;
          try {
            payload = JSON.parse(responseText);
          } catch (error) {
            return {
              ok: false,
              phase: 'json',
              status: response.status,
              contentType,
              requestId,
              detail: error instanceof Error ? error.message : String(error),
            };
          }
          const content = testCase.api === 'responses'
            ? payload?.output
                ?.flatMap((item) => item?.type === 'message' && Array.isArray(item.content) ? item.content : [])
                .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
                .map((part) => part.text)
                .join('')
            : payload?.choices?.[0]?.message?.content;
          return {
            ok: typeof content === 'string' && content.trim().length > 0,
            phase: 'response-shape',
            status: response.status,
            contentType,
            requestId,
            contentLength: typeof content === 'string' ? content.trim().length : 0,
          };
        } catch (error) {
          return {
            ok: false,
            phase: 'network-or-cors',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }, { target, testCase });

      expect(result, JSON.stringify(result, null, 2)).toMatchObject({
        ok: true,
        status: 200,
      });
      expect(result.contentType.toLowerCase()).toContain('application/json');
      expect(result.contentLength).toBeGreaterThan(0);
    });
  }

  for (const { target, testCase, voice } of speechCases) {
    test(`${target.name} · ${testCase.model} · ${voice} passes CORS and audio validation`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate(async ({ target, testCase, voice }) => {
        try {
          const response = await fetch(`${target.baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${target.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: testCase.model,
              voice,
              input: testCase.input,
              response_format: testCase.responseFormat,
            }),
          });
          const contentType = response.headers.get('content-type') || '';
          const requestId = response.headers.get('x-request-id')
            || response.headers.get('x-generation-id')
            || response.headers.get('cf-ray');
          if (!response.ok) {
            return {
              ok: false,
              phase: 'http',
              status: response.status,
              contentType,
              requestId,
              detail: (await response.text()).slice(0, 500),
            };
          }
          const bytes = await response.arrayBuffer();
          if (testCase.responseFormat === 'pcm') {
            const frameBytes = testCase.pcm.channels * 2;
            return {
              ok: bytes.byteLength > frameBytes && bytes.byteLength % frameBytes === 0,
              status: response.status,
              contentType,
              requestId,
              byteLength: bytes.byteLength,
              duration: bytes.byteLength / frameBytes / testCase.pcm.sampleRate,
            };
          }
          const context = new AudioContext();
          try {
            const audio = await context.decodeAudioData(bytes.slice(0));
            return {
              ok: true,
              status: response.status,
              contentType,
              requestId,
              byteLength: bytes.byteLength,
              duration: audio.duration,
            };
          } catch (error) {
            return {
              ok: false,
              phase: 'decode',
              status: response.status,
              contentType,
              requestId,
              byteLength: bytes.byteLength,
              detail: error instanceof Error ? error.message : String(error),
            };
          } finally {
            await context.close();
          }
        } catch (error) {
          return {
            ok: false,
            phase: 'network-or-cors',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }, { target, testCase, voice });

      expect(result, JSON.stringify(result, null, 2)).toMatchObject({
        ok: true,
        status: 200,
      });
      expect(result.contentType.toLowerCase()).toMatch(
        testCase.responseFormat === 'pcm' ? /^audio\/pcm(?:;|$)/ : /^audio\/(mpeg|mp3)(?:;|$)/,
      );
      expect(result.byteLength).toBeGreaterThan(32);
      expect(result.duration).toBeGreaterThan(0);
    });
  }
});
