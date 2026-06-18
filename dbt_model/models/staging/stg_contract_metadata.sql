{{
    config(
        schema='staging',
        alias='contract_metadata',
        materialized='incremental',
        unique_key=['address'],
        incremental_strategy='merge'
    )
}}

with source as (
    select * from {{ source('Token_Insight', 'dim_contracts') }}
    {% if is_incremental() %}
        where  fetched_at > now() - interval '1 day'
    {% endif %}
    
),

renamed as (
    select
        address,
        is_contract,
        contract_name,
        fetched_at
    from source
    where is_contract = true
    and contract_name is not null
)

select * from renamed