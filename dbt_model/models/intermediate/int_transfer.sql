{{
    config(
        schema='intermediate',
        alias='int_transfer',
        materialized='view'
    )
}}

with transfers as (
    select * from {{ ref('stg_token_transfers') }}
),

metadata as (
    select * from {{ ref('stg_token_metadata') }}
),

contract_metadata as (
    select * from {{ ref('stg_contract_metadata') }}
),

joined as (
    select
        t.id,
        tx_hash,
        t.from_address,
        t.to_address,
        t.amount as amount_raw,
        TRY_CAST(t.amount AS DOUBLE) / power(10, m.decimals) as amount,
        t.token_address,
        t.block_number,
        t.block_timestamp,
        t.timestamp,

        -- metadata columns, null if not yet fetched
        m.name          as token_name,
        m.symbol        as token_symbol,
        m.decimals      as token_decimals,
        m.total_supply  as token_total_supply,
        m.supply_source as token_supply_source,

        cm.contract_name as from_address_name,
        cm2.contract_name as to_address_name,
        

        -- flag to know if this transfer has metadata
        case 
            when m.token_address is not null then true 
            else false 
        end as has_metadata

    from transfers t
    left join metadata m 
        on t.token_address = m.token_address
    left join contract_metadata cm
        on t.from_address = cm.address
    left join contract_metadata cm2
        on t.to_address = cm2.address
)

select * from joined

order by token_address, block_timestamp