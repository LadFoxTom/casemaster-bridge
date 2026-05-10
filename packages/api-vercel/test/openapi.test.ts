import { describe, it, expect } from 'vitest';
import { generateOpenAPI } from '../../api-spec/src/openapi.js';

describe('OpenAPI generator', () => {
  it('produces a valid 3.1 doc with all routes mounted', () => {
    const doc = generateOpenAPI();
    expect(doc.openapi).toBe('3.1.0');
    const paths = Object.keys(doc.paths);
    expect(paths).toContain('/schema');
    expect(paths).toContain('/bo/{bo}/list');
    expect(paths).toContain('/bo/{bo}/save');
    expect(paths).toContain('/page/{path}/{fn}');
    expect(paths).toContain('/stream/{bo}');
  });
});
