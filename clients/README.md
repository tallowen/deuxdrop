
Install node libraries
`npm install socket.io redis paperboy`

Copy the md5 module into the modules directory
`cp md5.js to node_modules`

Get redis running on your local box.

> using [homebrew](http://mxcl.github.com/homebrew/) for Mac OS X
> `brew install redis`
> `redis-server /usr/local/etc/redis.conf`

Run the node chat server
`node server.js`