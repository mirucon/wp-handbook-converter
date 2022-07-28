#!/usr/bin/env node

'use strict'

const packageJson = require('./package.json')
const fs = require('fs')
const { program } = require('commander')
const mkdirp = require('mkdirp')
const del = require('del')
const WPAPI = require('wpapi')
const turndown = require('turndown')
const turndownService = new turndown({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
})

const getAll = (request) => {
  return request.then((response) => {
    if (!response._paging || !response._paging.next) {
      return response
    }
    // Request the next page and return both responses as one collection
    return Promise.all([response, getAll(response._paging.next)]).then(
      (responses) => responses.flat()
    )
  })
}

const generateJson = async (
  team,
  handbook,
  subdomain,
  outputDir,
  regenerate
) => {
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
    endpoint: `https://${subdomain}wordpress.org/${team}/wp-json`,
  })
  wp.handbooks = wp.registerRoute('wp/v2', `/${handbook}/(?P<id>)`)

  console.log(
    `Connecting to https://${subdomain}wordpress.org/${team}/wp-json/wp/v2/${handbook}/`
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
      // remove <span class='glossary-item-hidden-content'>inner contents
      const preContent = item.content.rendered.replace(
        /<span class=\'glossary-item-hidden-content\'>.*?<\/span><\/span>/g,
        ''
      )
      const markdownContent = turndownService.turndown(preContent)
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
  .arguments('<team>')
  .description('Generate a menu JSON file for WordPress.org handbook')
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
  .action((team, options) => {
    generateJson(
      team,
      options.handbook,
      options.subDomain,
      options.outputDir,
      options.regenerate
    )
  })

program.parse(process.argv)
