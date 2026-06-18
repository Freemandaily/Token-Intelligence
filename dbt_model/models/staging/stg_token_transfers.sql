{{
    config(
        schema='staging',
        alias='token_transfers',
        materialized='incremental',
        unique_key=['id'],
        incremental_strategy='merge'
    )
}}

with source as (

    select * from {{ source('Token_Insight', 'transfers') }}

    {% if is_incremental() %}
        where "block_timestamp" > (
            select max("block_timestamp") - 7200 from {{ this }}
        )
    {% endif %}

),

cleaned as (
    select
        id,
        transaction_hash as tx_hash,
        lower("from_address")   as from_address,
        lower("to_address")     as to_address,
        amount,
        lower("token_address")  as token_address,
        block_number,
        block_timestamp,
        to_timestamp(block_timestamp) as timestamp
    from source
)

select * from cleaned