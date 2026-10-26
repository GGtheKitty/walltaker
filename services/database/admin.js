import pg from 'pg';
const [operation,username]=process.argv.slice(2);
if(!['--promote','--demote'].includes(operation)||!username){console.error('Usage: node admin.js --promote|--demote USERNAME');process.exit(1);}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
try{const result=await pool.query('UPDATE users SET admin=$2,updated_at=now() WHERE lower(username)=lower($1) AND deleted_at IS NULL AND system_account=false RETURNING id',[username,operation==='--promote']);if(result.rowCount!==1)throw Error('Active ordinary account not found');console.log('Updated administrator access for account '+result.rows[0].id);}
catch(error){console.error(error.code || error.message);process.exitCode=1;}
finally{await pool.end();}
