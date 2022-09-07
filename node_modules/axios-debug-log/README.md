# axios-debug-log

[![Build Status](https://travis-ci.org/Gerhut/axios-debug-log.svg?branch=master)](https://travis-ci.org/Gerhut/axios-debug-log)
[![Coverage Status](https://coveralls.io/repos/github/Gerhut/axios-debug-log/badge.svg?branch=master)](https://coveralls.io/github/Gerhut/axios-debug-log?branch=master)
[![dependencies Status](https://david-dm.org/Gerhut/kroxy/status.svg)](https://david-dm.org/Gerhut/axios-debug-log)
[![devDependencies Status](https://david-dm.org/Gerhut/kroxy/dev-status.svg)](https://david-dm.org/Gerhut/axios-debug-log?type=dev)
[![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Axios interceptor of logging requests &amp responses by [debug](https://www.npmjs.com/package/debug).

![Screenshot](screenshot.png "Screenshot")

## Install 

    $ npm install --save axios axios-debug-log
    
## Node.js usage

1. Install: add `require('axios-debug-log')` before any axios execution.
2. Enable: set `DEBUG` environment variable to `axios` before start your fantastic Node.js application.

## Browser usage

1. Install: add `require('axios-debug-log')` before any axios execution.
2. Enable: set `localStorage.debug = "axios"` before start your fantastic web application.

Please read [README of debug](https://github.com/visionmedia/debug#readme) for usage details.

## License

MIT
