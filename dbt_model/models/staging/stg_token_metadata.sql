{{
    config(
        schema='staging',
        alias='token_metadata', 
        materialized='table'
    )
}}


select 
    lower(token_address) as token_address,
    name,
    symbol,
    decimals,
    total_supply,
    supply_source
from {{ source('Token_Insight', 'dim_tokens') }}