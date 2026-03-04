// Code Formatter Web Worker using Prettier
// When you make changes here, you need to run `npm run build` in order to see the changes in the dev environment.
importScripts("https://unpkg.com/prettier@3.1.0/standalone.js");
importScripts("https://unpkg.com/prettier@3.1.0/parser-postcss.js");
importScripts("https://unpkg.com/prettier@3.1.0/parser-html.js");

self.onmessage = async function (e) {
  const { codeToFormat, parser, requestId, options = {} } = e.data;

  try {
    let plugins = [];

    if (parser === "css") {
      plugins = [prettierPlugins.postcss];
    } else if (parser === "html") {
      plugins = [prettierPlugins.html];
    }

    const formattedCode = await prettier.format(codeToFormat, {
      parser,
      plugins,
      printWidth: options.printWidth || 80,
      tabWidth: options.tabWidth || 2,
      useTabs: options.useTabs || false,
      semi: options.semi !== false, // default true
      singleQuote: options.singleQuote || false,
      trailingComma: options.trailingComma || "none",
      bracketSpacing: options.bracketSpacing !== false, // default true
      bracketSameLine: options.bracketSameLine || false,
      arrowParens: options.arrowParens || "avoid",
      ...options
    });

    self.postMessage({
      requestId,
      success: true,
      formatted: formattedCode
    });
  } catch (error) {
    self.postMessage({
      requestId,
      success: false,
      error: error.message
    });
  }
};
