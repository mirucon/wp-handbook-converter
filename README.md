# wp-handbook-converter

[![Build Status](https://travis-ci.org/mirucon/wp-handbook-converter.svg?branch=master)](https://travis-ci.org/mirucon/wp-handbook-converter)

## Description

Convert all pages in a specific type of WordPress handbook into markdown files.

## Install

```bash
$ npm i -g wp-handbook-converter

# Or 

$ yarn global add wp-handbook-converter
```

## `wp-handbook-converter` command

```bash
$ wp-handbook-converter <team>
```

### options

* `-b, --handbook` &lt;handbook&gt;  Specify handbook name. (Default "handbook")
* `-s, --sub-domain` &lt;sub-domain&gt; Specify subdomain name. e.g. "developer" for developer.w.org, "w.org" for w.org (Default "make")

### Example

Get Meetup Handbook

```bash
$ handbook-tracker community --handbook meetup-handbook
```

Get theme developer Handbook

```bash
$ handbook-tracker '' --handbook theme-handbook --sub-domain developer
```

### TODO

* [ ] Support diffs to see what files are updated or created
* [ ] Remove files no longer necessary automatically