#!/usr/bin/env node

'use strict'

const packageJson = require('./package.json')
const fs = require('fs')
const { program } = require('commander')
const mkdirp = require('mkdirp')
const del = require('del')
const WPAPI = require('wpapi')
const TurndownService = require('turndown')
const {tables}  = require('turndown-plugin-gfm')

// Languages that can be specified in the code markdown
const codeLanguages = {
  css: 'css',
  bash: 'bash',
  php: 'php',
  yaml: 'yaml',
  xml: 'xml',
  jscript: 'javascript',
}

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
]

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
})
turndownService.use(tables);

// Remove Glossary
turndownService.addRule('glossary', {
  filter: node => {
    const classList = node.getAttribute('class');
    if ( classList ) {
      return classList === 'glossary-item-hidden-content';
    }
    return false;
  },
  replacement: () => {
    return '';
  }
});

// Remove code trigger anchor
turndownService.addRule('code-trigger-anchor', {
  filter: node => {
    const classList = node.getAttribute('class');
    if ( classList ) {
      return classList.includes('show-complete-source') || classList.includes(`less-complete-source`);
    }
    return false;
  },
  replacement: () => {
    return '';
  }
});

// Transform dt tag to strong tag
turndownService.addRule('dt-to-strong', {
  filter: ['dt'],
  replacement: (content, node, options) => {
    return options.strongDelimiter + content + options.strongDelimiter
  }
});

// Transform pre code block to code markdown
turndownService.addRule('precode to code', {
  filter: node => {
    const classList = node.getAttribute('class');
    const isCode = node.nodeName === 'PRE' && classList && classList.includes('brush:');
    return isCode;
  },
  replacement: (content, node) => {
    const classList = node.getAttribute('class');

    // Search for a language that matches the list of code languages
    const codeLanguage = Object.keys(codeLanguages).reduce((currentLanguage, language) => {
      if ( classList.includes(language) ) {
        return codeLanguages[language];
      }
      return currentLanguage;
    }, undefined);

    // Unescape contents
    let newContent = unEscapes.reduce((accumulator, unEscape) => {
      return accumulator.replace(unEscape[0], unEscape[1])
    }, content)

    // Remove br tag
    newContent = newContent.replace(/^<br \/>\n\n|<br \/>\n/g, "\n");
    // Remove first and last paragraph tag
    newContent = newContent.replace(/^<\/p>|<p>$/g, '');
    // Remove first new line
    newContent = newContent.replace(/^\n/, '');
    // Convert to language-aware markdown
    newContent = codeLanguage ? `\`\`\`${codeLanguage}\n` + newContent + '```' : "```\n" + newContent + '```';

    return newContent;
  }
});

const getAll = (request) => {
  return request.then((response) => {
    if (!response._paging || !response._paging.next) {
      return response
    }
    // Request the next page and return both responses as one collection
    return Promise.all([
      response,
      getAll(response._paging.next),
    ]).then((responses) => responses.flat())
  })
}

const generateJson = async (
  team,
  handbook,
  subdomain,
  outputDir,
  regenerate
) => {
  team = team ? `${team}/` : ''
  handbook = handbook ? handbook : 'handbook'
  subdomain = `${
    subdomain ? (subdomain === 'w.org' ? '' : subdomain) : 'make'
  }.`
  outputDir = outputDir ? outputDir.replace(/\/$/, '') + '/' : 'en/'

  if (regenerate) {
    // Remove the output directory first if -r option is set.
    del([`${outputDir}`]).catch(() => {})
  }

  await mkdirp(`${outputDir}/`)
    .then((made) => {
      if (made) {
        console.log(`Created directory ${made}`)
      }
    })
    .catch((e) => {
      console.error(
        'Could not create output directory. Make sure you have right permission on the directory and try again.'
      )
      throw e
    })

  const wp = new WPAPI({
    endpoint: `https://${subdomain}wordpress.org/${team}wp-json`,
  })


  wp.handbooks = wp.registerRoute('wp/v2', `/${handbook}/(?P<id>)`)

  console.log(
    `Connecting to https://${subdomain}wordpress.org/${team}wp-json/wp/v2/${handbook}/`
  )

  getAll(wp.handbooks()).then(async (allPosts) => {
    if (allPosts.length === 0) {
      console.warn('No posts found.')
      process.exit(1)
    }

    let rootPath = ''
    for (const item of allPosts) {
      if (parseInt(item.parent) === 0) {
        rootPath = item.link.split(item.slug)[0]
        break
      } else {
        rootPath = `https://${subdomain}wordpress.org/${team}/${handbook}/`
      }
    }

    for (const item of allPosts) {
      const path = item.link.split(rootPath)[1].replace(/\/$/, '') || 'index'
      const filePath =
        path.split('/').length > 1
          ? path.substring(0, path.lastIndexOf('/')) + '/'
          : ''

      const content = item.content.rendered;
      const markdownContent = turndownService.turndown(content)
      const markdown = `# ${item.title.rendered}\n\n${markdownContent}`

      await mkdirp(`${outputDir}/${filePath}`)
        .then((_) => {
          try {
            fs.readFile(`${outputDir}/${path}.md`, 'utf8', (err, data) => {
              if (!data) {
                fs.writeFile(
                  `${outputDir}/${path}.md`,
                  markdown,
                  'utf8',
                  (err) => {
                    if (err) {
                      throw err
                    } else {
                      console.log(`Created ${path}.md`)
                    }
                  }
                )
              } else if (data === markdown) {
                console.log(
                  '\x1b[37m%s\x1b[0m',
                  `${path}.md already exists with the exact same content. Skipping...`
                )
              } else {
                fs.writeFile(
                  `${outputDir}/${path}.md`,
                  'utf8',
                  markdown,
                  (err) => {
                    if (err) {
                      throw err
                    } else {
                      console.log(`Updated ${path}.md`)
                    }
                  }
                )
              }
            })
          } catch (e) {
            fs.writeFile(`${outputDir}/${path}.md`, 'utf8', markdown, (err) => {
              if (err) {
                throw err
              } else {
                console.log(`Created ${path}.md`)
              }
            })
          }
        })
        .catch((e) => {
          console.error(
            'An error occurred during saving files. Please try again.'
          )
          throw e
        })
    }
  })
}

program
  .version(packageJson.version)
  .option(
    '-t, --team <team>',
    'Specify team name'
  )
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
  .action((options) => {
    generateJson(
      options.team,
      options.handbook,
      options.subDomain,
      options.outputDir,
      options.regenerate
    )
  })

program.parse(process.argv)
