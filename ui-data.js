// Range pagination avoids truncating totals or payment balances at a fixed limit.
export async function readAll(build,pageSize=500){const rows=[];for(let from=0;;from+=pageSize){const {data,error}=await build().range(from,from+pageSize-1);if(error)return {data:null,error};rows.push(...(data||[]));if((data||[]).length<pageSize)return {data:rows,error:null};}}
