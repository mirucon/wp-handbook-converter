#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { program } from 'commander';
import TurndownService from 'turndown';
import WPAPI from 'wpapi';
import { tables } from 'turndown-plugin-gfm';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

// Languages that can be specified in the code markdown
const codeLanguages = {
  css: 'css',
  bash: 'bash',
  php: 'php',
  yaml: 'yaml',
  xml: 'xml',
  jscript: 'javascript',
};

// Rules that remove escapes in code blocks
const unEscapes = [
  [/\\\\/g, '\\'],
  [/\\\*/g, '*'],
  [/\\-/g, '-'],
  [/^\\+ /g, '+ '],
  [/\\=/g, '='],
  [/\\`/g, '`'],
  [/\\~~~/g, '~~~'],
  [/\\\[/g, '['],
  [/\\\]/g, ']'],
  [/\\>/g, '>'],
  [/\\_/g, '_'],
  [/\&quot;/g, '"'],
  [/\&lt;/g, '<'],
  [/\&gt;/g, '>'],
];

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});
turndownService.use(tables);

// Remove Glossary
turndownService.addRule('glossary', {
  filter: (node) => {
    const classList = node.getAttribute('class');
    if (classList) {
      return classList === 'glossary-item-hidden-content';
    }
    return false;
  },
  replacement: () => {
    return '';
  },
});

// Remove code trigger anchor
turndownService.addRule('code-trigger-anchor', {
  filter: (node) => {
    const classList = node.getAttribute('class');
    if (classList) {
      return (
        classList.includes('show-complete-source') ||
        classList.includes(`less-complete-source`)
      );
    }
    return false;
  },
  replacement: () => {
    return '';
  },
});

// Transform dt tag to strong tag
turndownService.addRule('dt-to-strong', {
  filter: ['dt'],
  replacement: (content, node, options) => {
    return options.strongDelimiter + content + options.strongDelimiter;
  },
});

// Transform pre code block to code markdown
turndownService.addRule('precode to code', {
  filter: (node) => {
    const classList = node.getAttribute('class');
    return node.nodeName === 'PRE' && classList && classList.includes('brush:');
  },
  replacement: (content, node) => {
    const classList = node.getAttribute('class');

    // Search for a language that matches the list of code languages
    const codeLanguage = Object.keys(codeLanguages).reduce(
      (currentLanguage, language) => {
        if (classList.includes(language)) {
          return codeLanguages[language];
        }
        return currentLanguage;
      },
      undefined
    );

    // Unescape contents
    let newContent = unEscapes.reduce((accumulator, unEscape) => {
      return accumulator.replace(unEscape[0], unEscape[1]);
    }, content);

    // Remove br tag
    newContent = newContent.replace(/^<br \/>\n\n|<br \/>\n/g, '\n');
    // Remove first and last paragraph tag
    newContent = newContent.replace(/^<\/p>|<p>$/g, '');
    // Remove first new line
    newContent = newContent.replace(/^\n/, '');
    // Convert to language-aware markdown
    newContent = '```' + (codeLanguage ?? '') + '\n' + newContent + '```';

    return newContent;
  },
});

const getAll = async (request) => {
  let response = await request;
  while (response._paging && response._paging.next) {
    response = response.concat(await response._paging.next);
  }
  return response;
};

export const generateFiles = async (
  team,
  handbook,
  subdomain,
  outputDir,
  regenerate
) => {
  team = team ? `${team}/` : '';
  handbook = handbook ? handbook : 'handbook';
  subdomain = `${
    subdomain ? (subdomain === 'w.org' ? '' : subdomain) : 'make'
  }.`;
  outputDir = outputDir ? outputDir.replace(/\/$/, '') + '/' : 'en/';

  if (regenerate) {
    // Remove the output directory first if -r option is set.
    await rm(outputDir, { recursive: true, force: true });
  }

  try {
    await mkdir(outputDir, { recursive: true });
    console.log(`Created directory ${outputDir}`);
  } catch (e) {
    console.error(
      'Could not create output directory. Make sure you have right permission on the directory and try again.'
    );
    throw e;
  }

  const wp = new WPAPI({
    endpoint: `https://${subdomain}wordpress.org/${team}wp-json`,
  });

  wp.handbooks = wp.registerRoute('wp/v2', `/${handbook}/(?P<id>)`);

  console.log(
    `Connecting to https://${subdomain}wordpress.org/${team}wp-json/wp/v2/${handbook}/`
  );

  const allPosts = await getAll(wp.handbooks());

  if (allPosts.length === 0) {
    console.warn('No posts found.');
    process.exit(1);
  }

  let rootPath = '';
  for (const item of allPosts) {
    if (parseInt(item.parent) === 0) {
      rootPath = item.link.split(item.slug)[0];
      break;
    } else {
      rootPath = `https://${subdomain}wordpress.org/${team}/${handbook}/`;
    }
  }

  for (const item of allPosts) {
    const path = item.link.split(rootPath)[1].replace(/\/$/, '') || 'index';
    const filePath =
      path.split('/').length > 1
        ? path.substring(0, path.lastIndexOf('/')) + '/'
        : '';

    const content = item.content.rendered;
    const markdownContent = turndownService.turndown(content);
    const markdown = `# ${item.title.rendered}\n\n${markdownContent}`;

    try {
      await mkdir(`${outputDir}/${filePath}`, { recursive: true });
      const existingContent = await readFile(`${outputDir}/${path}.md`, 'utf8');
      if (existingContent === markdown) {
        console.log(
          '\x1b[37m%s\x1b[0m',
          `${path}.md already exists with the exact same content. Skipping...`
        );
      } else {
        await writeFile(`${outputDir}/${path}.md`, markdown, {
          encoding: 'utf8',
        });
        console.log(`Updated ${path}.md`);
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        await writeFile(`${outputDir}/${path}.md`, markdown, {
          encoding: 'utf8',
        });
        console.log(`Created ${path}.md`);
      } else {
        console.error(
          'An error occurred during saving files. Please try again.'
        );
        throw e;
      }
    }
  }
};

program
  .version(packageJson.version)
  .description('Generate a menu JSON file for WordPress.org handbook')
  .option('-t, --team <team>', 'Specify team name')
  .option(
    '-b, --handbook <handbook>',
    'Specify handbook name (default "handbook")'
  )
  .option(
    '-s, --sub-domain <subdomain>',
    'Specify subdomain, for example, "developer" for developer.w.org, "w.org" for w.org (default "make")'
  )
  .option(
    '-o --output-dir <outputDir>',
    'Specify directory to save files (default en/)'
  )
  .option(
    '-r --regenerate',
    'If this option is supplied, the directory you specified as output directory will once deleted, and it will regenerate all the files in the directory'
  )
  .allowExcessArguments()
  .action((options) => {
    generateFiles(
      options.team,
      options.handbook,
      options.subDomain,
      options.outputDir,
      options.regenerate
    );
  });

program.parse(process.argv);
