const { initializeDatabase } = require('../config/postgres');
const { quoteIdentifier } = require('../config/sqlSchema');
async function getNextSequenceValue(tableName, columnName = 'code') {
  const database = await initializeDatabase();
  
  // Format the sequence name based on the table and column name
  const seqName = `${tableName}_${columnName}_seq`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63);
  
  // Ensure the sequence exists starting from 0
  await database.query(`CREATE SEQUENCE IF NOT EXISTS ${quoteIdentifier(seqName)} MINVALUE 0 START 0`);
  
  const quotedSeqName = quoteIdentifier(seqName);
  const result = await database.query(`SELECT nextval('${quotedSeqName}'::regclass) as next_val`);
  
  return String(result.rows[0].next_val);
}

async function syncSequence(tableName, columnName = 'code') {
  const database = await initializeDatabase();
  const seqName = `${tableName}_${columnName}_seq`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63);
  const quotedSeqName = quoteIdentifier(seqName);
  
  await database.query(`CREATE SEQUENCE IF NOT EXISTS ${quotedSeqName} MINVALUE 0 START 0`);
  
  const sql = `
    SELECT MAX(CAST(${quoteIdentifier(columnName)} AS INTEGER)) as max_val
    FROM ${quoteIdentifier(tableName)}
    WHERE ${quoteIdentifier(columnName)} ~ '^\\d+$'
  `;
  const result = await database.query(sql);
  
  if (result.rows.length === 0 || result.rows[0].max_val === null) {
    await database.query(`SELECT setval('${quotedSeqName}'::regclass, 0, false)`);
  } else {
    const maxVal = parseInt(result.rows[0].max_val, 10);
    await database.query(`SELECT setval('${quotedSeqName}'::regclass, ${maxVal}, true)`);
  }
}

module.exports = {
  getNextSequenceValue,
  syncSequence
};
