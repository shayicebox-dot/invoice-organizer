import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * Teaches Node the `@/` import alias so `src` modules can be unit-tested
 * directly, the same way the bundler resolves them.
 *
 * Node resolves ESM specifiers itself and knows nothing about tsconfig paths,
 * so without this a test can only import modules that import nothing. Fifteen
 * lines here is a better trade than either shaping the code around the test
 * runner or taking on a test framework to get one feature.
 */

const SRC = pathToFileURL(new URL('../src/', import.meta.url).pathname).href;

register(
  `data:text/javascript,
  export function resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      return next(${JSON.stringify(SRC)} + specifier.slice(2) + '.ts', context);
    }
    return next(specifier, context);
  }`,
  import.meta.url,
);
