#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { program } from 'commander'
import TurndownService from 'turndown'
import path from 'path'
import { tables } from 'turndown-plugin-gfm'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

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
turndownService.use(tables)

// Remove Glossary
turndownService.addRule('glossary', {
  filter: (node) => {
    const classList = node.getAttribute('class')
    if (classList) {
      return classList === 'glossary-item-hidden-content'
    }
    return false
  },
  replacement: () => {
    return ''
  },
})

// Remove code trigger anchor
turndownService.addRule('code-trigger-anchor', {
  filter: (node) => {
    const classList = node.getAttribute('class')
    if (classList) {
      return (
        classList.includes('show-complete-source') ||
        classList.includes(`less-complete-source`)
      )
    }
    return false
  },
  replacement: () => {
    return ''
  },
})

// Transform dt tag to strong tag
turndownService.addRule('dt-to-strong', {
  filter: ['dt'],
  replacement: (content, node, options) => {
    return options.strongDelimiter + content + options.strongDelimiter
  },
})

// Transform pre code block to code markdown
turndownService.addRule('precode to code', {
  filter: (node) => {
    const classList = node.getAttribute('class')
    return node.nodeName === 'PRE' && classList && classList.includes('brush:')
  },
  replacement: (content, node) => {
    const classList = node.getAttribute('class')

    // Search for a language that matches the list of code languages
    const codeLanguage = Object.keys(codeLanguages).reduce(
      (currentLanguage, language) => {
        if (classList.includes(language)) {
          return codeLanguages[language]
        }
        return currentLanguage
      },
      undefined,
    )

    // Unescape contents
    let newContent = unEscapes.reduce((accumulator, unEscape) => {
      return accumulator.replace(unEscape[0], unEscape[1])
    }, content)

    // Remove br tag
    newContent = newContent.replace(/^<br \/>\n\n|<br \/>\n/g, '\n')
    // Remove first and last paragraph tag
    newContent = newContent.replace(/^<\/p>|<p>$/g, '')
    // Remove first new line
    newContent = newContent.replace(/^\n/, '')
    // Convert to language-aware markdown
    newContent = '```' + (codeLanguage ?? '') + '\n' + newContent + '```'

    return newContent
  },
})

const getAll = async (url) => {
  let results = []
  const initialFetchUrl = `${url}?page=1&per_page=100`
  const initialResponse = await fetch(initialFetchUrl, {
    headers: {
      'User-Agent': 'wp-handbook-converter/1.0.0',
    },
  })

  if (!initialResponse.ok) {
    console.error(`Error fetching ${initialFetchUrl}`)
    throw new Error(`HTTP error! status: ${initialResponse.status}`)
  }

  const totalPages = parseInt(
    initialResponse.headers.get('x-wp-totalpages'),
    10,
  )
  const initialData = await initialResponse.json()
  results = results.concat(initialData)

  if (totalPages > 1) {
    for (let page = 2; page <= totalPages; page++) {
      const fetchUrl = `${url}?page=${page}&per_page=100`
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'wp-handbook-converter/1.0.0',
        },
      })
      if (!response.ok) {
        console.error(`Error fetching ${fetchUrl}`)
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      results = results.concat(data)
    }
  }

  return results
}

export const generateFiles = async (
  team,
  handbook,
  subdomain,
  outputDir,
  regenerate,
) => {
  team = team ? `${team}/` : ''
  handbook = handbook ? handbook : 'handbook'
  subdomain = `${
    subdomain ? (subdomain === 'w.org' ? '' : subdomain) : 'make'
  }.`
  outputDir = outputDir || 'en/'

  if (regenerate) {
    // Remove the output directory first if -r option is set.
    await rm(outputDir, { recursive: true, force: true })
  }

  try {
    await mkdir(outputDir, { recursive: true })
    console.log(`Created directory ${outputDir}`)
  } catch (e) {
    console.error(
      'Could not create output directory. Make sure you have right permission on the directory and try again.',
    )
    throw e
  }

  const url = `https://${subdomain}wordpress.org/${team}wp-json/wp/v2/${handbook}`
  console.log(`Connecting to ${url}`)

  const allPosts = await getAll(url)

  if (allPosts.length === 0) {
    console.warn('No posts found.')
    process.exit(1)
  }

  const rootItem = allPosts.find((item) => parseInt(item.parent) === 0)
  let rootPath
  if (rootItem && rootItem.link && rootItem.slug) {
    rootPath = rootItem.link.split(rootItem.slug)[0]
  } else {
    rootPath = `https://${subdomain}wordpress.org/${team}${handbook}/`
  }

  for (const item of allPosts) {
    const pathSegment = item.link.split(rootPath)[1]
    const itemPath =
      (pathSegment === undefined ? item.slug : pathSegment).replace(
        /\/$/,
        '',
      ) || 'index'

    const content = item.content.rendered
    const markdownContent = turndownService.turndown(content)
    const markdown = `# ${item.title.rendered}\n\n${markdownContent}`
    const finalPath = path.join(outputDir, `${itemPath}.md`)
    const dirForFile = path.dirname(finalPath)

    try {
      await mkdir(dirForFile, { recursive: true })
      const existingContent = await readFile(finalPath, 'utf8')
      if (existingContent === markdown) {
        console.log(
          '\x1b[37m%s\x1b[0m',
          `${itemPath}.md already exists with the exact same content. Skipping...`,
        )
      } else {
        await writeFile(finalPath, markdown, {
          encoding: 'utf8',
        })
        console.log(`Updated ${itemPath}.md`)
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        await writeFile(finalPath, markdown, {
          encoding: 'utf8',
        })
        console.log(`Created ${itemPath}.md`)
      } else {
        console.error(
          'An error occurred during saving files. Please try again.',
        )
        throw e
      }
    }
  }
}

program
  .version(packageJson.version)
  .description('Generate a menu JSON file for WordPress.org handbook')
  .option('-t, --team <team>', 'Specify team name')
  .option(
    '-b, --handbook <handbook>',
    'Specify handbook name (default "handbook")',
  )
  .option(
    '-s, --sub-domain <subdomain>',
    'Specify subdomain, for example, "developer" for developer.w.org, "w.org" for w.org (default "make")',
  )
  .option(
    '-o --output-dir <outputDir>',
    'Specify directory to save files (default en/)',
  )
  .option(
    '-r --regenerate',
    'If this option is supplied, the directory you specified as output directory will once deleted, and it will regenerate all the files in the directory',
  )
  .allowExcessArguments()
  .action((options) => {
    generateFiles(
      options.team,
      options.handbook,
      options.subDomain,
      options.outputDir,
      options.regenerate,
    )
  })

program.parse(process.argv)
