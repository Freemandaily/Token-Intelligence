{{
    config(
        schema='fact',
        alias='token_transfers_base',
        materialized='incremental',
        unique_key='id',
        incremental_strategy='merge'
    )
}}

with token_enriched as (select * from {{ref('int_transfer')}} where chain = 'base')

{% if is_incremental() %}
    , target as (
        select id, has_metadata, from_address_name, to_address_name
        from {{ this }}
    )
    
    select s.*
    from token_enriched s
    left join target t on s.id = t.id
    where
        t.id is null -- 1. New transfers not yet in this table
        or (s.has_metadata = true and t.has_metadata = false) -- 2. Token metadata was missing but is now found
        or (s.from_address_name is not null and t.from_address_name is null) -- 3. from_address_name missing
        or (s.to_address_name is not null and t.to_address_name is null) -- 4. to_address_name missing

{% else %}
    select * from token_enriched
{% endif %}

order by token_address, block_timestamp
