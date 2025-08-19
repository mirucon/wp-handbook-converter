# wp-handbook-converter

[![npm version](https://badge.fury.io/js/wp-handbook-converter.svg)](https://badge.fury.io/js/wp-handbook-converter)

## Description

Convert all pages in a specific type of WordPress handbook into markdown files.

## Install

```bash
$ npm i -g wp-handbook-converter
```

If you want to run the command without installing the package, use this: `$ npx wp-handbook-converter`

## `wp-handbook-converter` command options

- `-t, --team` &lt;team&gt; Specify team name.
- `-b, --handbook` &lt;handbook&gt; Specify handbook name. (Default "handbook")
- `-s, --sub-domain` &lt;sub-domain&gt; Specify subdomain name. e.g. "developer" for developer.w.org, "w.org" for w.org (Default "make")
- `-o, --output-dir` &lt;output-dir&gt; Specify the directory to save files (default `en/`)
- `-r, --regenerate` &lt;regenerate&gt; If this option is supplied, the directory you specified as output directory will once deleted, and it will regenerate all the files in the directory

### Example

Get Core Contributor Handbook

```bash
$ wp-handbook-converter --team core
```

Get Meetup Organizer Handbook

```bash
$ wp-handbook-converter --team community --handbook meetup-handbook
```

Get theme Handbook

```bash
$ wp-handbook-converter --handbook theme-handbook --sub-domain developer
```

Get plugin Handbook

```bash
$ wp-handbook-converter --handbook plugin-handbook --sub-domain developer
```

## Development

### Linting

This project uses [Prettier](https://prettier.io/) for code formatting. You can check for linting errors by running:

```bash
npm run lint
```

You can automatically fix linting errors by running:

```bash
npm run lint:fix
```
