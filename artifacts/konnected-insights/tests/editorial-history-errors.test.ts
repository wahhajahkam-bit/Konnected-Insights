import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '../src/lib/api';
import {
  editorialHistoryErrorMessage,
  retryEditorialHistoryRequest,
} from '../src/pages/admin-components/editorial-history';

const contexts = ['decisions', 'earlier-decisions', 'version'] as const;
const rawSecret = 'database password=do-not-expose';

const expectedMessages = {
  decisions: {
    400: 'The history filters or cursor are invalid. Review the filters and try again.',
    401: 'Your editorial session has expired. Sign in again, then try again.',
    403: 'You do not have permission to view editorial history.',
    404: 'Editorial decisions are temporarily unavailable. Try again.',
    500: 'Editorial decisions are temporarily unavailable. Try again.',
    network: 'Editorial decisions are temporarily unavailable. Try again.',
  },
  'earlier-decisions': {
    400: 'The history filters or cursor are invalid. Review the filters and try again.',
    401: 'Your editorial session has expired. Sign in again, then try again.',
    403: 'You do not have permission to view editorial history.',
    404: 'Earlier decisions are temporarily unavailable. Try again.',
    500: 'Earlier decisions are temporarily unavailable. Try again.',
    network: 'Earlier decisions are temporarily unavailable. Try again.',
  },
  version: {
    400: 'This historical version request is invalid.',
    401: 'Your editorial session has expired. Sign in again, then try again.',
    403: 'You do not have permission to view editorial history.',
    404: 'This historical version is no longer available.',
    500: 'This historical version is temporarily unavailable. Try again.',
    network: 'This historical version is temporarily unavailable. Try again.',
  },
} as const;

test('history errors return safe status- and context-specific messages', () => {
  for (const context of contexts) {
    for (const status of [400, 401, 403, 404, 500] as const) {
      const error = new ApiError(rawSecret, status);
      const message = editorialHistoryErrorMessage(error, context);

      assert.equal(message, expectedMessages[context][status]);
      assert.equal(message.includes(rawSecret), false);
    }

    const networkMessage = editorialHistoryErrorMessage(new Error(rawSecret), context);
    assert.equal(networkMessage, expectedMessages[context].network);
    assert.equal(networkMessage.includes(rawSecret), false);
  }
});

test('history retry policy never automatically retries auth, validation, or missing records', () => {
  for (const status of [400, 401, 403, 404]) {
    const error = new ApiError(rawSecret, status);
    assert.equal(retryEditorialHistoryRequest(0, error), false);
    assert.equal(retryEditorialHistoryRequest(1, error), false);
  }
});

test('history retry policy retries temporary and network failures only once', () => {
  for (const error of [new ApiError(rawSecret, 500), new Error(rawSecret)]) {
    assert.equal(retryEditorialHistoryRequest(0, error), true);
    assert.equal(retryEditorialHistoryRequest(1, error), false);
    assert.equal(retryEditorialHistoryRequest(2, error), false);
  }
});