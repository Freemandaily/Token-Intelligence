{{
    config(
        schema='fact',
        alias='fact_token_transfers',
        materialized='incremental',
        unique_key='id',
        incremental_strategy='merge'
    )
}}

with token_enriched as (select * from {{ref('int_transfer')}})

select * from token_enriched

{% if is_incremental() %}
    where
        -- 1. New transfers not yet in this table
        id not in (select id from {{ this }})

        or

        -- 2. Token metadata was missing but is now found
        (has_metadata = true and id in (
            select id from {{ this }}
            where has_metadata = false
        ))

        or

        -- 3. from_address_name was missing but is now found
        (from_address_name is not null and id in (
            select id from {{ this }}
            where from_address_name is null
        ))

        or

        -- 4. to_address_name was missing but is now found
        (to_address_name is not null and id in (
            select id from {{ this }}
            where to_address_name is null
        ))
{% endif %}

order by token_address, block_timestamp