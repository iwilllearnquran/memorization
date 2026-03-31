# ---------------------------
# Actual Alerts Query
# ---------------------------
query_cert_actual = f"""
WITH flagged AS (
    SELECT *,
        EVENT_DT_TM - LAG(EVENT_DT_TM) OVER (PARTITION BY client ORDER BY EVENT_DT_TM) AS gap_interval,
        double_val - LAG(double_val) OVER (PARTITION BY client ORDER BY EVENT_DT_TM) AS db_gap_interval
    FROM esm_analyticscert.ESM_ANALYTICS_EVENT eae
    WHERE
        eae.RULE IN ('RTMS PAF HIGH IMPACT')
        AND eae.EVENT_TYPE = 'CORRELATION_ALERT'
        AND DATE(eae.EVENT_DT_TM) > SYSDATE - {number_of_days}
),
markers AS (
    SELECT *,
        CASE WHEN db_gap_interval IS NOT NULL AND db_gap_interval != 1 THEN 1 ELSE 0 END AS reset_flag
    FROM flagged
),
groups AS (
    SELECT *,
        SUM(reset_flag) OVER (PARTITION BY client ORDER BY EVENT_DT_TM ROWS UNBOUNDED PRECEDING) AS group_id
    FROM markers
),
group_bounds AS (
    SELECT
        client, domain,
        group_id,
        MIN(EVENT_DT_TM) AS first_occurrence_time,
        MAX(EVENT_DT_TM) AS last_occurrence_time
    FROM groups
    GROUP BY client, group_id,  domain
)
SELECT
    g.client, g.domain,
    g.group_id,
    e.EVENT_DT_TM AS timestamp_within_group
FROM group_bounds g
JOIN esm_analyticscert.ESM_ANALYTICS_EVENT e
    ON e.client = g.client
    AND e.EVENT_DT_TM BETWEEN g.first_occurrence_time AND g.last_occurrence_time
    AND e.RULE = 'RTMS PAF HIGH IMPACT'
    AND e.EVENT_TYPE = 'CORRELATION_ALERT'
ORDER BY g.client, g.domain, g.group_id, e.EVENT_DT_TM;
"""
cert_actual_poll_count = getVerticaCert(query_cert_actual)


# ---------------------------
# Should Have Been Query
# ---------------------------
query_cert_should_have_been_query = f"""
WITH flagged AS (
    SELECT *,
        EVENT_DT_TM - LAG(EVENT_DT_TM) OVER (PARTITION BY client ORDER BY EVENT_DT_TM) AS gap_interval
    FROM esm_analyticscert.ESM_ANALYTICS_EVENT eae
    WHERE
        eae.RULE = 'RTMS PAF HIGH IMPACT'
        AND eae.EVENT_TYPE = 'CORRELATION_ALERT'
        AND DATE(eae.EVENT_DT_TM) > SYSDATE - {number_of_days}
),
markers AS (
    SELECT *,
        CASE WHEN gap_interval IS NOT NULL AND gap_interval > INTERVAL '15' MINUTE THEN 1 ELSE 0 END AS reset_flag
    FROM flagged
),
groups AS (
    SELECT *,
        SUM(reset_flag) OVER (PARTITION BY client ORDER BY EVENT_DT_TM ROWS UNBOUNDED PRECEDING) AS group_id
    FROM markers
),
group_bounds AS (
    SELECT
        client, domain,
        group_id,
        MIN(EVENT_DT_TM) AS first_occurrence_time,
        MAX(EVENT_DT_TM) AS last_occurrence_time
    FROM groups
    GROUP BY client, group_id, domain
)
SELECT
    g.client,g.domain,
    g.group_id,
    e.EVENT_DT_TM AS timestamp_within_group
FROM group_bounds g
JOIN esm_analyticscert.ESM_ANALYTICS_EVENT e
    ON e.client = g.client
    AND e.EVENT_DT_TM BETWEEN g.first_occurrence_time AND g.last_occurrence_time
    AND e.RULE = 'RTMS PAF HIGH IMPACT'
    AND e.EVENT_TYPE = 'CORRELATION_ALERT'
ORDER BY g.client,g.domain, g.group_id, e.EVENT_DT_TM;
"""
cert_should_have_been = getVerticaCert(query_cert_should_have_been_query)


# ---------------------------
# Should Real Clear Query
# ---------------------------
cert_should_real_clear_query = f"""
WITH flagged AS (
    SELECT *,
        EVENT_DT_TM - LAG(EVENT_DT_TM) OVER (PARTITION BY client ORDER BY EVENT_DT_TM) AS gap_interval
    FROM esm_analyticscert.ESM_ANALYTICS_EVENT eae
    WHERE
        eae.RULE = 'RTMS PAF HIGH IMPACT'
        AND eae.EVENT_TYPE IN ('CORRELATION_ALERT', 'CORRELATION_CLEAR')
        AND DATE(eae.EVENT_DT_TM) > SYSDATE - {number_of_days}
),
markers AS (
    SELECT *,
        CASE WHEN EVENT_TYPE = 'CORRELATION_CLEAR' THEN 1 ELSE 0 END AS reset_flag
    FROM flagged
),
groups AS (
    SELECT *,
        SUM(reset_flag) OVER (PARTITION BY client ORDER BY EVENT_DT_TM ROWS UNBOUNDED PRECEDING) AS group_id
    FROM markers
),
group_bounds AS (
    SELECT
        client, domain,
        group_id,
        MIN(EVENT_DT_TM) AS first_occurrence_time,
        MAX(EVENT_DT_TM) AS last_occurrence_time
    FROM groups
    GROUP BY client, group_id, domain
)
SELECT
    g.client,g.domain,
    g.group_id,
    e.EVENT_DT_TM AS timestamp_within_group
FROM group_bounds g
JOIN esm_analyticscert.ESM_ANALYTICS_EVENT e
    ON e.client = g.client
    AND e.EVENT_DT_TM BETWEEN g.first_occurrence_time AND g.last_occurrence_time
    AND e.RULE = 'RTMS PAF HIGH IMPACT'
    AND e.EVENT_TYPE = 'CORRELATION_ALERT'
ORDER BY g.client,g.domain, g.group_id, e.EVENT_DT_TM;
"""
cert_should_real_clear = getVerticaCert(cert_should_real_clear_query)
