// Database configuration - CMP7003B Group 3
// See Lab 8 
// Switch between development (local) and production (UEA server) using NODE_ENV

const config = {
    development: {
        user: 'postgres',       // local postgres username
        database: 'postgres',   // local database name
        password: 'ypj26etu',           // local postgres password
        host: 'localhost',
        port: '5432'
    },
    production: {
        user: 'postgres',                       // UEA username
        database: 'postgres',                   // UEA database name
        password: 'ypj26etu',                           // UEA password
        host: 'cmpstudb-01.cmp.uea.ac.uk',     // UEA postgres server
        port: '5432'
    }
};

module.exports = config;
