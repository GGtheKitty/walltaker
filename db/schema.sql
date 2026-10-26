-- Node database baseline. Schema only: no application data or credentials.
--
-- PostgreSQL database dump
--


-- Dumped from database version 14.24 (Debian 14.24-1.pgdg13+2)
-- Dumped by pg_dump version 14.24 (Debian 14.24-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: ability; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ability AS ENUM (
    'can_show_videos',
    'can_be_set_by_porn_bot',
    'can_be_set_by_lizard',
    'is_kink_aligned',
    'is_master_only'
);


--
-- Name: walltaker_api_authenticate(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.walltaker_api_authenticate(supplied_key text) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT id FROM public.users
  WHERE deleted_at IS NULL AND api_key = supplied_key AND length(supplied_key) > 0
  ORDER BY id LIMIT 1
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_mailbox_inbound_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_mailbox_inbound_emails (
    id bigint NOT NULL,
    status integer DEFAULT 0 NOT NULL,
    message_id character varying NOT NULL,
    message_checksum character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: action_mailbox_inbound_emails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.action_mailbox_inbound_emails_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: action_mailbox_inbound_emails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.action_mailbox_inbound_emails_id_seq OWNED BY public.action_mailbox_inbound_emails.id;


--
-- Name: action_text_rich_texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_text_rich_texts (
    id bigint NOT NULL,
    name character varying NOT NULL,
    body text,
    record_type character varying NOT NULL,
    record_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: action_text_rich_texts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.action_text_rich_texts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: action_text_rich_texts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.action_text_rich_texts_id_seq OWNED BY public.action_text_rich_texts.id;


--
-- Name: active_storage_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_storage_attachments (
    id bigint NOT NULL,
    name character varying NOT NULL,
    record_type character varying NOT NULL,
    record_id bigint NOT NULL,
    blob_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: active_storage_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.active_storage_attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: active_storage_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.active_storage_attachments_id_seq OWNED BY public.active_storage_attachments.id;


--
-- Name: active_storage_blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_storage_blobs (
    id bigint NOT NULL,
    key character varying NOT NULL,
    filename character varying NOT NULL,
    content_type character varying,
    metadata text,
    service_name character varying NOT NULL,
    byte_size bigint NOT NULL,
    checksum character varying,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: active_storage_blobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.active_storage_blobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: active_storage_blobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.active_storage_blobs_id_seq OWNED BY public.active_storage_blobs.id;


--
-- Name: active_storage_variant_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_storage_variant_records (
    id bigint NOT NULL,
    blob_id bigint NOT NULL,
    variation_digest character varying NOT NULL
);


--
-- Name: active_storage_variant_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.active_storage_variant_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: active_storage_variant_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.active_storage_variant_records_id_seq OWNED BY public.active_storage_variant_records.id;


--
-- Name: ahoy_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ahoy_events (
    id bigint NOT NULL,
    visit_id bigint,
    user_id bigint,
    name character varying,
    properties text,
    "time" timestamp(6) without time zone
);


--
-- Name: ahoy_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ahoy_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ahoy_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ahoy_events_id_seq OWNED BY public.ahoy_events.id;


--
-- Name: ahoy_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ahoy_visits (
    id bigint NOT NULL,
    visit_token character varying,
    visitor_token character varying,
    user_id bigint,
    ip character varying,
    user_agent text,
    referrer text,
    referring_domain character varying,
    landing_page text,
    browser character varying,
    os character varying,
    device_type character varying,
    country character varying,
    region character varying,
    city character varying,
    latitude double precision,
    longitude double precision,
    utm_source character varying,
    utm_medium character varying,
    utm_term character varying,
    utm_content character varying,
    utm_campaign character varying,
    app_version character varying,
    os_version character varying,
    platform character varying,
    started_at timestamp(6) without time zone
);


--
-- Name: ahoy_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ahoy_visits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ahoy_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ahoy_visits_id_seq OWNED BY public.ahoy_visits.id;


--
-- Name: banned_ips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banned_ips (
    id bigint NOT NULL,
    ip_address character varying,
    banned_by_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: banned_ips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banned_ips_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banned_ips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banned_ips_id_seq OWNED BY public.banned_ips.id;


--
-- Name: blazer_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blazer_audits (
    id bigint NOT NULL,
    user_id bigint,
    query_id bigint,
    statement text,
    data_source character varying,
    created_at timestamp(6) without time zone
);


--
-- Name: blazer_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blazer_audits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blazer_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blazer_audits_id_seq OWNED BY public.blazer_audits.id;


--
-- Name: blazer_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blazer_checks (
    id bigint NOT NULL,
    creator_id bigint,
    query_id bigint,
    state character varying,
    schedule character varying,
    emails text,
    slack_channels text,
    check_type character varying,
    message text,
    last_run_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: blazer_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blazer_checks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blazer_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blazer_checks_id_seq OWNED BY public.blazer_checks.id;


--
-- Name: blazer_dashboard_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blazer_dashboard_queries (
    id bigint NOT NULL,
    dashboard_id bigint,
    query_id bigint,
    "position" integer,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: blazer_dashboard_queries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blazer_dashboard_queries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blazer_dashboard_queries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blazer_dashboard_queries_id_seq OWNED BY public.blazer_dashboard_queries.id;


--
-- Name: blazer_dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blazer_dashboards (
    id bigint NOT NULL,
    creator_id bigint,
    name character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: blazer_dashboards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blazer_dashboards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blazer_dashboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blazer_dashboards_id_seq OWNED BY public.blazer_dashboards.id;


--
-- Name: blazer_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blazer_queries (
    id bigint NOT NULL,
    creator_id bigint,
    name character varying,
    description text,
    statement text,
    data_source character varying,
    status character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: blazer_queries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blazer_queries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blazer_queries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blazer_queries_id_seq OWNED BY public.blazer_queries.id;


--
-- Name: cached_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cached_posts (
    id bigint NOT NULL,
    post_id bigint,
    url character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: cached_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cached_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cached_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cached_posts_id_seq OWNED BY public.cached_posts.id;


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id bigint NOT NULL,
    link_id bigint NOT NULL,
    user_id bigint NOT NULL,
    content character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comments_id_seq OWNED BY public.comments.id;


--
-- Name: crono_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crono_jobs (
    id bigint NOT NULL,
    job_id character varying NOT NULL,
    log text,
    last_performed_at timestamp without time zone,
    healthy boolean,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: crono_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crono_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crono_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crono_jobs_id_seq OWNED BY public.crono_jobs.id;


--
-- Name: emoji_link_decorations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emoji_link_decorations (
    id bigint NOT NULL,
    link_id bigint NOT NULL,
    emoji character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: emoji_link_decorations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.emoji_link_decorations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: emoji_link_decorations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.emoji_link_decorations_id_seq OWNED BY public.emoji_link_decorations.id;


--
-- Name: form_elements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_elements (
    id bigint NOT NULL,
    label character varying NOT NULL,
    kind integer NOT NULL,
    survey_id bigint NOT NULL,
    sort_order integer NOT NULL,
    required boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: form_elements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.form_elements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_elements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.form_elements_id_seq OWNED BY public.form_elements.id;


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id bigint NOT NULL,
    sender_id bigint NOT NULL,
    receiver_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    confirmed boolean
);


--
-- Name: friendships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.friendships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: friendships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.friendships_id_seq OWNED BY public.friendships.id;


--
-- Name: history_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.history_events (
    id bigint NOT NULL,
    did_what integer DEFAULT 0 NOT NULL,
    ahoy_visit_id bigint,
    user_id bigint NOT NULL,
    surrender_controller_id bigint,
    link_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: history_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.history_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: history_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.history_events_id_seq OWNED BY public.history_events.id;


--
-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_codes (
    id bigint NOT NULL,
    code character varying NOT NULL,
    generated_by_id bigint,
    redeemed_by_id bigint,
    redeemed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: invite_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invite_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invite_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invite_codes_id_seq OWNED BY public.invite_codes.id;


--
-- Name: kink_havers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kink_havers (
    id bigint NOT NULL,
    kink_id bigint,
    user_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    is_starred boolean DEFAULT false NOT NULL
);


--
-- Name: kink_havers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kink_havers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kink_havers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kink_havers_id_seq OWNED BY public.kink_havers.id;


--
-- Name: kinks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kinks (
    id bigint NOT NULL,
    name character varying(30) NOT NULL,
    works_on_e621 boolean DEFAULT false NOT NULL
);


--
-- Name: kinks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kinks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kinks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kinks_id_seq OWNED BY public.kinks.id;


--
-- Name: leashes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leashes (
    id bigint NOT NULL,
    friendship_id bigint NOT NULL,
    master_id bigint NOT NULL,
    pet_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    flair text
);


--
-- Name: leashes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leashes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leashes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leashes_id_seq OWNED BY public.leashes.id;


--
-- Name: link_abilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.link_abilities (
    id bigint NOT NULL,
    link_id bigint NOT NULL,
    ability public.ability NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: link_abilities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.link_abilities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: link_abilities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.link_abilities_id_seq OWNED BY public.link_abilities.id;


--
-- Name: links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.links (
    id bigint NOT NULL,
    expires timestamp(6) without time zone,
    user_id bigint NOT NULL,
    terms character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    blacklist character varying,
    post_url character varying,
    post_thumbnail_url character varying,
    post_description character varying,
    last_ping timestamp without time zone,
    set_by_id bigint,
    friends_only boolean,
    last_ping_user_agent character varying,
    never_expires boolean DEFAULT false,
    theme character varying,
    response_text character varying,
    response_type integer,
    ahoy_visit_id bigint,
    min_score integer,
    live_client_started_at timestamp without time zone,
    custom_url character varying,
    forked_from_id bigint,
    wizard_page character varying,
    e621_post_id bigint
);


--
-- Name: links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.links_id_seq OWNED BY public.links.id;


--
-- Name: message_thread_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_thread_participants (
    id bigint NOT NULL,
    message_thread_id bigint NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    notify boolean DEFAULT true NOT NULL
);


--
-- Name: message_thread_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_thread_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_thread_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_thread_participants_id_seq OWNED BY public.message_thread_participants.id;


--
-- Name: message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_threads (
    id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    name character varying
);


--
-- Name: message_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_threads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_threads_id_seq OWNED BY public.message_threads.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id bigint NOT NULL,
    message_thread_id bigint NOT NULL,
    from_user_id bigint NOT NULL,
    content character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: node_account_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_account_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    user_id bigint,
    operation character varying NOT NULL,
    previous_username character varying,
    notification_id bigint,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_account_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_account_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_account_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_account_events_id_seq OWNED BY public.node_account_events.id;


--
-- Name: node_activity_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_activity_receipts (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    operation character varying NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_activity_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_activity_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_activity_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_activity_receipts_id_seq OWNED BY public.node_activity_receipts.id;


--
-- Name: node_automation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_automation_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    generation bigint NOT NULL,
    effects jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_automation_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_automation_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_automation_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_automation_events_id_seq OWNED BY public.node_automation_events.id;


--
-- Name: node_automation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_automation_jobs (
    id bigint NOT NULL,
    job_key character varying(160) NOT NULL,
    kind character varying NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying DEFAULT 'queued'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    run_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    locked_at timestamp(6) without time zone,
    locked_by character varying,
    last_error character varying,
    completed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT node_automation_job_status CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: node_automation_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_automation_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_automation_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_automation_jobs_id_seq OWNED BY public.node_automation_jobs.id;


--
-- Name: node_automation_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_automation_schedules (
    name character varying NOT NULL,
    next_run_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_browser_legacy_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_browser_legacy_sessions (
    fingerprint character varying(64) NOT NULL,
    user_id bigint,
    expires_at timestamp(6) without time zone NOT NULL,
    revoked_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_browser_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_browser_sessions (
    id bigint NOT NULL,
    token_digest character varying(64) NOT NULL,
    user_id bigint NOT NULL,
    original_actor_id bigint,
    surrender_id bigint,
    legacy_fingerprints jsonb DEFAULT '[]'::jsonb NOT NULL,
    remember boolean DEFAULT false NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    revoked_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_browser_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_browser_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_browser_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_browser_sessions_id_seq OWNED BY public.node_browser_sessions.id;


--
-- Name: node_link_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_link_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    link_id bigint NOT NULL,
    user_id bigint NOT NULL,
    operation character varying NOT NULL,
    result jsonb NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_link_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_link_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_link_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_link_events_id_seq OWNED BY public.node_link_events.id;


--
-- Name: node_moderation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_moderation_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    operation character varying NOT NULL,
    user_id bigint,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    effects jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_moderation_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_moderation_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_moderation_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_moderation_events_id_seq OWNED BY public.node_moderation_events.id;


--
-- Name: node_newsroom_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_newsroom_states (
    id bigint NOT NULL,
    generation bigint DEFAULT 0 NOT NULL,
    rendered_event_id bigint,
    kind character varying,
    entry jsonb DEFAULT '{}'::jsonb NOT NULL,
    story jsonb DEFAULT '{}'::jsonb NOT NULL,
    busy_until timestamp(6) without time zone,
    throttle_until timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_newsroom_states_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_newsroom_states_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_newsroom_states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_newsroom_states_id_seq OWNED BY public.node_newsroom_states.id;


--
-- Name: node_reaction_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_reaction_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    link_id bigint NOT NULL,
    comment_ids bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    notification_id bigint,
    history_changed boolean DEFAULT false NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_reaction_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_reaction_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_reaction_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_reaction_events_id_seq OWNED BY public.node_reaction_events.id;


--
-- Name: node_social_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_social_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    operation character varying NOT NULL,
    user_id bigint,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    effects jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_social_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_social_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_social_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_social_events_id_seq OWNED BY public.node_social_events.id;


--
-- Name: node_tracker_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_tracker_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    operation character varying NOT NULL,
    user_id bigint,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    effects jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_tracker_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_tracker_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_tracker_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_tracker_events_id_seq OWNED BY public.node_tracker_events.id;


--
-- Name: node_wallpaper_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_wallpaper_events (
    id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    link_id bigint NOT NULL,
    past_link_id bigint NOT NULL,
    delivered_at timestamp(6) without time zone,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: node_wallpaper_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.node_wallpaper_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_wallpaper_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.node_wallpaper_events_id_seq OWNED BY public.node_wallpaper_events.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    notification_type integer,
    text character varying,
    link character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: nut_pledges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nut_pledges (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    past_link_id bigint,
    failed_on timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    year integer NOT NULL
);


--
-- Name: nut_pledges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nut_pledges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nut_pledges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nut_pledges_id_seq OWNED BY public.nut_pledges.id;


--
-- Name: nuttracker_orgasms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuttracker_orgasms (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    is_ruined boolean,
    rating integer,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    caused_by_user_id bigint
);


--
-- Name: nuttracker_orgasms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nuttracker_orgasms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nuttracker_orgasms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nuttracker_orgasms_id_seq OWNED BY public.nuttracker_orgasms.id;


--
-- Name: past_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.past_links (
    id bigint NOT NULL,
    user_id integer,
    post_url character varying,
    post_thumbnail_url character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    link_id bigint,
    set_by_id bigint,
    ahoy_visit_id bigint,
    tags text DEFAULT ''::text NOT NULL,
    e621_post_id bigint
);


--
-- Name: past_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.past_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: past_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.past_links_id_seq OWNED BY public.past_links.id;


--
-- Name: profile_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_domains (
    id bigint NOT NULL,
    domain character varying NOT NULL,
    status integer DEFAULT 0 NOT NULL,
    seen_count bigint DEFAULT 0 NOT NULL,
    first_seen_at timestamp(6) without time zone NOT NULL,
    last_seen_at timestamp(6) without time zone NOT NULL,
    reviewed_by_id bigint,
    reviewed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: profile_domains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_domains_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_domains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_domains_id_seq OWNED BY public.profile_domains.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    name character varying,
    content text DEFAULT ''::text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    public boolean DEFAULT false NOT NULL,
    origin_id bigint
);


--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id bigint NOT NULL,
    reporter_id bigint NOT NULL,
    reportable_type character varying,
    reportable_id bigint,
    is_closed boolean DEFAULT false,
    snapshot character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    reason text DEFAULT ''::text
);


--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: scoops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scoops (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    details text,
    link_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    was_shown boolean DEFAULT false
);


--
-- Name: scoops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scoops_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scoops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scoops_id_seq OWNED BY public.scoops.id;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id bigint NOT NULL,
    key character varying NOT NULL,
    value character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: site_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.site_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: site_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.site_settings_id_seq OWNED BY public.site_settings.id;


--
-- Name: solid_queue_blocked_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_blocked_executions (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    queue_name character varying NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    concurrency_key character varying NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_blocked_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_blocked_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_blocked_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_blocked_executions_id_seq OWNED BY public.solid_queue_blocked_executions.id;


--
-- Name: solid_queue_claimed_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_claimed_executions (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    process_id bigint,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_claimed_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_claimed_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_claimed_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_claimed_executions_id_seq OWNED BY public.solid_queue_claimed_executions.id;


--
-- Name: solid_queue_failed_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_failed_executions (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    error text,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_failed_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_failed_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_failed_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_failed_executions_id_seq OWNED BY public.solid_queue_failed_executions.id;


--
-- Name: solid_queue_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_jobs (
    id bigint NOT NULL,
    queue_name character varying NOT NULL,
    class_name character varying NOT NULL,
    arguments text,
    priority integer DEFAULT 0 NOT NULL,
    active_job_id character varying,
    scheduled_at timestamp(6) without time zone,
    finished_at timestamp(6) without time zone,
    concurrency_key character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_jobs_id_seq OWNED BY public.solid_queue_jobs.id;


--
-- Name: solid_queue_pauses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_pauses (
    id bigint NOT NULL,
    queue_name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_pauses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_pauses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_pauses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_pauses_id_seq OWNED BY public.solid_queue_pauses.id;


--
-- Name: solid_queue_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_processes (
    id bigint NOT NULL,
    kind character varying NOT NULL,
    last_heartbeat_at timestamp(6) without time zone NOT NULL,
    supervisor_id bigint,
    pid integer NOT NULL,
    hostname character varying,
    metadata text,
    created_at timestamp(6) without time zone NOT NULL,
    name character varying NOT NULL
);


--
-- Name: solid_queue_processes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_processes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_processes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_processes_id_seq OWNED BY public.solid_queue_processes.id;


--
-- Name: solid_queue_ready_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_ready_executions (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    queue_name character varying NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_ready_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_ready_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_ready_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_ready_executions_id_seq OWNED BY public.solid_queue_ready_executions.id;


--
-- Name: solid_queue_recurring_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_recurring_executions (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    task_key character varying NOT NULL,
    run_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_recurring_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_recurring_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_recurring_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_recurring_executions_id_seq OWNED BY public.solid_queue_recurring_executions.id;


--
-- Name: solid_queue_recurring_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_recurring_tasks (
    id bigint NOT NULL,
    key character varying NOT NULL,
    schedule character varying NOT NULL,
    command character varying(2048),
    class_name character varying,
    arguments text,
    queue_name character varying,
    priority integer DEFAULT 0,
    static boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_recurring_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_recurring_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_recurring_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_recurring_tasks_id_seq OWNED BY public.solid_queue_recurring_tasks.id;


--
-- Name: solid_queue_scheduled_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_scheduled_executions (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    queue_name character varying NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    scheduled_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_scheduled_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_scheduled_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_scheduled_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_scheduled_executions_id_seq OWNED BY public.solid_queue_scheduled_executions.id;


--
-- Name: solid_queue_semaphores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solid_queue_semaphores (
    id bigint NOT NULL,
    key character varying NOT NULL,
    value integer DEFAULT 1 NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: solid_queue_semaphores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solid_queue_semaphores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solid_queue_semaphores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solid_queue_semaphores_id_seq OWNED BY public.solid_queue_semaphores.id;


--
-- Name: surrenders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surrenders (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    friendship_id bigint NOT NULL,
    expires_at timestamp without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    accepted_consequences boolean DEFAULT false,
    pending boolean DEFAULT false,
    logged_in boolean DEFAULT false,
    current_page character varying,
    controller_user_id bigint NOT NULL,
    duration_hours integer DEFAULT 24 NOT NULL,
    token character varying NOT NULL
);


--
-- Name: surrenders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.surrenders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: surrenders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.surrenders_id_seq OWNED BY public.surrenders.id;


--
-- Name: survey_response_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_response_answers (
    id bigint NOT NULL,
    form_element_id bigint NOT NULL,
    survey_response_id bigint NOT NULL,
    value text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: survey_response_answers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_response_answers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_response_answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_response_answers_id_seq OWNED BY public.survey_response_answers.id;


--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_responses (
    id bigint NOT NULL,
    survey_id bigint NOT NULL,
    user_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    comment text DEFAULT ''::text
);


--
-- Name: survey_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_responses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_responses_id_seq OWNED BY public.survey_responses.id;


--
-- Name: surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surveys (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    public boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: surveys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.surveys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: surveys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.surveys_id_seq OWNED BY public.surveys.id;


--
-- Name: user_icons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_icons (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    icon_name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: user_icons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_icons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_icons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_icons_id_seq OWNED BY public.user_icons.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying,
    username character varying,
    password_digest character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    details character varying,
    admin boolean DEFAULT false,
    api_key character varying(8),
    set_count integer DEFAULT 0 NOT NULL,
    viewing_link_id bigint,
    password_reset_token character varying,
    mascot character varying,
    pervert boolean,
    quarantined boolean DEFAULT false,
    colour_preference integer DEFAULT 0,
    advanced boolean DEFAULT false NOT NULL,
    profile_id bigint,
    flagged boolean DEFAULT false,
    is_reporter boolean DEFAULT false,
    is_cutie boolean DEFAULT false,
    is_supporter boolean DEFAULT false,
    password_reset_sent_at timestamp(6) without time zone,
    username_changed_at timestamp(6) without time zone,
    deleted_at timestamp(6) without time zone,
    deleted_username character varying,
    system_account boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallpaper_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallpaper_clients (
    id bigint NOT NULL,
    name character varying NOT NULL,
    section character varying DEFAULT 'hidden'::character varying NOT NULL,
    url character varying,
    platform character varying,
    deprecated boolean DEFAULT false NOT NULL,
    match_text character varying,
    link_name character varying,
    icon_name character varying,
    device_type character varying,
    "position" integer DEFAULT 0 NOT NULL,
    match_position integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: wallpaper_clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallpaper_clients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallpaper_clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallpaper_clients_id_seq OWNED BY public.wallpaper_clients.id;


--
-- Name: action_mailbox_inbound_emails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_mailbox_inbound_emails ALTER COLUMN id SET DEFAULT nextval('public.action_mailbox_inbound_emails_id_seq'::regclass);


--
-- Name: action_text_rich_texts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_text_rich_texts ALTER COLUMN id SET DEFAULT nextval('public.action_text_rich_texts_id_seq'::regclass);


--
-- Name: active_storage_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_attachments ALTER COLUMN id SET DEFAULT nextval('public.active_storage_attachments_id_seq'::regclass);


--
-- Name: active_storage_blobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_blobs ALTER COLUMN id SET DEFAULT nextval('public.active_storage_blobs_id_seq'::regclass);


--
-- Name: active_storage_variant_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_variant_records ALTER COLUMN id SET DEFAULT nextval('public.active_storage_variant_records_id_seq'::regclass);


--
-- Name: ahoy_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ahoy_events ALTER COLUMN id SET DEFAULT nextval('public.ahoy_events_id_seq'::regclass);


--
-- Name: ahoy_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ahoy_visits ALTER COLUMN id SET DEFAULT nextval('public.ahoy_visits_id_seq'::regclass);


--
-- Name: banned_ips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_ips ALTER COLUMN id SET DEFAULT nextval('public.banned_ips_id_seq'::regclass);


--
-- Name: blazer_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_audits ALTER COLUMN id SET DEFAULT nextval('public.blazer_audits_id_seq'::regclass);


--
-- Name: blazer_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_checks ALTER COLUMN id SET DEFAULT nextval('public.blazer_checks_id_seq'::regclass);


--
-- Name: blazer_dashboard_queries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_dashboard_queries ALTER COLUMN id SET DEFAULT nextval('public.blazer_dashboard_queries_id_seq'::regclass);


--
-- Name: blazer_dashboards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_dashboards ALTER COLUMN id SET DEFAULT nextval('public.blazer_dashboards_id_seq'::regclass);


--
-- Name: blazer_queries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_queries ALTER COLUMN id SET DEFAULT nextval('public.blazer_queries_id_seq'::regclass);


--
-- Name: cached_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cached_posts ALTER COLUMN id SET DEFAULT nextval('public.cached_posts_id_seq'::regclass);


--
-- Name: comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments ALTER COLUMN id SET DEFAULT nextval('public.comments_id_seq'::regclass);


--
-- Name: crono_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crono_jobs ALTER COLUMN id SET DEFAULT nextval('public.crono_jobs_id_seq'::regclass);


--
-- Name: emoji_link_decorations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emoji_link_decorations ALTER COLUMN id SET DEFAULT nextval('public.emoji_link_decorations_id_seq'::regclass);


--
-- Name: form_elements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_elements ALTER COLUMN id SET DEFAULT nextval('public.form_elements_id_seq'::regclass);


--
-- Name: friendships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships ALTER COLUMN id SET DEFAULT nextval('public.friendships_id_seq'::regclass);


--
-- Name: history_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_events ALTER COLUMN id SET DEFAULT nextval('public.history_events_id_seq'::regclass);


--
-- Name: invite_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes ALTER COLUMN id SET DEFAULT nextval('public.invite_codes_id_seq'::regclass);


--
-- Name: kink_havers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kink_havers ALTER COLUMN id SET DEFAULT nextval('public.kink_havers_id_seq'::regclass);


--
-- Name: kinks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kinks ALTER COLUMN id SET DEFAULT nextval('public.kinks_id_seq'::regclass);


--
-- Name: leashes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leashes ALTER COLUMN id SET DEFAULT nextval('public.leashes_id_seq'::regclass);


--
-- Name: link_abilities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_abilities ALTER COLUMN id SET DEFAULT nextval('public.link_abilities_id_seq'::regclass);


--
-- Name: links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links ALTER COLUMN id SET DEFAULT nextval('public.links_id_seq'::regclass);


--
-- Name: message_thread_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_thread_participants ALTER COLUMN id SET DEFAULT nextval('public.message_thread_participants_id_seq'::regclass);


--
-- Name: message_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads ALTER COLUMN id SET DEFAULT nextval('public.message_threads_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: node_account_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_account_events ALTER COLUMN id SET DEFAULT nextval('public.node_account_events_id_seq'::regclass);


--
-- Name: node_activity_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_activity_receipts ALTER COLUMN id SET DEFAULT nextval('public.node_activity_receipts_id_seq'::regclass);


--
-- Name: node_automation_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_automation_events ALTER COLUMN id SET DEFAULT nextval('public.node_automation_events_id_seq'::regclass);


--
-- Name: node_automation_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_automation_jobs ALTER COLUMN id SET DEFAULT nextval('public.node_automation_jobs_id_seq'::regclass);


--
-- Name: node_browser_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_browser_sessions ALTER COLUMN id SET DEFAULT nextval('public.node_browser_sessions_id_seq'::regclass);


--
-- Name: node_link_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_link_events ALTER COLUMN id SET DEFAULT nextval('public.node_link_events_id_seq'::regclass);


--
-- Name: node_moderation_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_moderation_events ALTER COLUMN id SET DEFAULT nextval('public.node_moderation_events_id_seq'::regclass);


--
-- Name: node_newsroom_states id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_newsroom_states ALTER COLUMN id SET DEFAULT nextval('public.node_newsroom_states_id_seq'::regclass);


--
-- Name: node_reaction_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_reaction_events ALTER COLUMN id SET DEFAULT nextval('public.node_reaction_events_id_seq'::regclass);


--
-- Name: node_social_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_social_events ALTER COLUMN id SET DEFAULT nextval('public.node_social_events_id_seq'::regclass);


--
-- Name: node_tracker_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_tracker_events ALTER COLUMN id SET DEFAULT nextval('public.node_tracker_events_id_seq'::regclass);


--
-- Name: node_wallpaper_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_wallpaper_events ALTER COLUMN id SET DEFAULT nextval('public.node_wallpaper_events_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: nut_pledges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nut_pledges ALTER COLUMN id SET DEFAULT nextval('public.nut_pledges_id_seq'::regclass);


--
-- Name: nuttracker_orgasms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuttracker_orgasms ALTER COLUMN id SET DEFAULT nextval('public.nuttracker_orgasms_id_seq'::regclass);


--
-- Name: past_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_links ALTER COLUMN id SET DEFAULT nextval('public.past_links_id_seq'::regclass);


--
-- Name: profile_domains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_domains ALTER COLUMN id SET DEFAULT nextval('public.profile_domains_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: scoops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoops ALTER COLUMN id SET DEFAULT nextval('public.scoops_id_seq'::regclass);


--
-- Name: site_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings ALTER COLUMN id SET DEFAULT nextval('public.site_settings_id_seq'::regclass);


--
-- Name: solid_queue_blocked_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_blocked_executions ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_blocked_executions_id_seq'::regclass);


--
-- Name: solid_queue_claimed_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_claimed_executions ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_claimed_executions_id_seq'::regclass);


--
-- Name: solid_queue_failed_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_failed_executions ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_failed_executions_id_seq'::regclass);


--
-- Name: solid_queue_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_jobs ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_jobs_id_seq'::regclass);


--
-- Name: solid_queue_pauses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_pauses ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_pauses_id_seq'::regclass);


--
-- Name: solid_queue_processes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_processes ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_processes_id_seq'::regclass);


--
-- Name: solid_queue_ready_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_ready_executions ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_ready_executions_id_seq'::regclass);


--
-- Name: solid_queue_recurring_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_recurring_executions ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_recurring_executions_id_seq'::regclass);


--
-- Name: solid_queue_recurring_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_recurring_tasks ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_recurring_tasks_id_seq'::regclass);


--
-- Name: solid_queue_scheduled_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_scheduled_executions ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_scheduled_executions_id_seq'::regclass);


--
-- Name: solid_queue_semaphores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_semaphores ALTER COLUMN id SET DEFAULT nextval('public.solid_queue_semaphores_id_seq'::regclass);


--
-- Name: surrenders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surrenders ALTER COLUMN id SET DEFAULT nextval('public.surrenders_id_seq'::regclass);


--
-- Name: survey_response_answers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response_answers ALTER COLUMN id SET DEFAULT nextval('public.survey_response_answers_id_seq'::regclass);


--
-- Name: survey_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses ALTER COLUMN id SET DEFAULT nextval('public.survey_responses_id_seq'::regclass);


--
-- Name: surveys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys ALTER COLUMN id SET DEFAULT nextval('public.surveys_id_seq'::regclass);


--
-- Name: user_icons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_icons ALTER COLUMN id SET DEFAULT nextval('public.user_icons_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wallpaper_clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallpaper_clients ALTER COLUMN id SET DEFAULT nextval('public.wallpaper_clients_id_seq'::regclass);


--
-- Name: action_mailbox_inbound_emails action_mailbox_inbound_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_mailbox_inbound_emails
    ADD CONSTRAINT action_mailbox_inbound_emails_pkey PRIMARY KEY (id);


--
-- Name: action_text_rich_texts action_text_rich_texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_text_rich_texts
    ADD CONSTRAINT action_text_rich_texts_pkey PRIMARY KEY (id);


--
-- Name: active_storage_attachments active_storage_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_attachments
    ADD CONSTRAINT active_storage_attachments_pkey PRIMARY KEY (id);


--
-- Name: active_storage_blobs active_storage_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_blobs
    ADD CONSTRAINT active_storage_blobs_pkey PRIMARY KEY (id);


--
-- Name: active_storage_variant_records active_storage_variant_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_variant_records
    ADD CONSTRAINT active_storage_variant_records_pkey PRIMARY KEY (id);


--
-- Name: ahoy_events ahoy_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ahoy_events
    ADD CONSTRAINT ahoy_events_pkey PRIMARY KEY (id);


--
-- Name: ahoy_visits ahoy_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ahoy_visits
    ADD CONSTRAINT ahoy_visits_pkey PRIMARY KEY (id);


--
-- Name: banned_ips banned_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_ips
    ADD CONSTRAINT banned_ips_pkey PRIMARY KEY (id);


--
-- Name: blazer_audits blazer_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_audits
    ADD CONSTRAINT blazer_audits_pkey PRIMARY KEY (id);


--
-- Name: blazer_checks blazer_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_checks
    ADD CONSTRAINT blazer_checks_pkey PRIMARY KEY (id);


--
-- Name: blazer_dashboard_queries blazer_dashboard_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_dashboard_queries
    ADD CONSTRAINT blazer_dashboard_queries_pkey PRIMARY KEY (id);


--
-- Name: blazer_dashboards blazer_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_dashboards
    ADD CONSTRAINT blazer_dashboards_pkey PRIMARY KEY (id);


--
-- Name: blazer_queries blazer_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blazer_queries
    ADD CONSTRAINT blazer_queries_pkey PRIMARY KEY (id);


--
-- Name: cached_posts cached_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cached_posts
    ADD CONSTRAINT cached_posts_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: crono_jobs crono_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crono_jobs
    ADD CONSTRAINT crono_jobs_pkey PRIMARY KEY (id);


--
-- Name: emoji_link_decorations emoji_link_decorations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emoji_link_decorations
    ADD CONSTRAINT emoji_link_decorations_pkey PRIMARY KEY (id);


--
-- Name: form_elements form_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_elements
    ADD CONSTRAINT form_elements_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: history_events history_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_events
    ADD CONSTRAINT history_events_pkey PRIMARY KEY (id);


--
-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);


--
-- Name: kink_havers kink_havers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kink_havers
    ADD CONSTRAINT kink_havers_pkey PRIMARY KEY (id);


--
-- Name: kinks kinks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kinks
    ADD CONSTRAINT kinks_pkey PRIMARY KEY (id);


--
-- Name: leashes leashes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leashes
    ADD CONSTRAINT leashes_pkey PRIMARY KEY (id);


--
-- Name: link_abilities link_abilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_abilities
    ADD CONSTRAINT link_abilities_pkey PRIMARY KEY (id);


--
-- Name: links links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_pkey PRIMARY KEY (id);


--
-- Name: message_thread_participants message_thread_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_thread_participants
    ADD CONSTRAINT message_thread_participants_pkey PRIMARY KEY (id);


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: node_account_events node_account_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_account_events
    ADD CONSTRAINT node_account_events_pkey PRIMARY KEY (id);


--
-- Name: node_activity_receipts node_activity_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_activity_receipts
    ADD CONSTRAINT node_activity_receipts_pkey PRIMARY KEY (id);


--
-- Name: node_automation_events node_automation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_automation_events
    ADD CONSTRAINT node_automation_events_pkey PRIMARY KEY (id);


--
-- Name: node_automation_jobs node_automation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_automation_jobs
    ADD CONSTRAINT node_automation_jobs_pkey PRIMARY KEY (id);


--
-- Name: node_automation_schedules node_automation_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_automation_schedules
    ADD CONSTRAINT node_automation_schedules_pkey PRIMARY KEY (name);


--
-- Name: node_browser_legacy_sessions node_browser_legacy_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_browser_legacy_sessions
    ADD CONSTRAINT node_browser_legacy_sessions_pkey PRIMARY KEY (fingerprint);


--
-- Name: node_browser_sessions node_browser_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_browser_sessions
    ADD CONSTRAINT node_browser_sessions_pkey PRIMARY KEY (id);


--
-- Name: node_link_events node_link_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_link_events
    ADD CONSTRAINT node_link_events_pkey PRIMARY KEY (id);


--
-- Name: node_moderation_events node_moderation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_moderation_events
    ADD CONSTRAINT node_moderation_events_pkey PRIMARY KEY (id);


--
-- Name: node_newsroom_states node_newsroom_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_newsroom_states
    ADD CONSTRAINT node_newsroom_states_pkey PRIMARY KEY (id);


--
-- Name: node_reaction_events node_reaction_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_reaction_events
    ADD CONSTRAINT node_reaction_events_pkey PRIMARY KEY (id);


--
-- Name: node_social_events node_social_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_social_events
    ADD CONSTRAINT node_social_events_pkey PRIMARY KEY (id);


--
-- Name: node_tracker_events node_tracker_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_tracker_events
    ADD CONSTRAINT node_tracker_events_pkey PRIMARY KEY (id);


--
-- Name: node_wallpaper_events node_wallpaper_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_wallpaper_events
    ADD CONSTRAINT node_wallpaper_events_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nut_pledges nut_pledges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nut_pledges
    ADD CONSTRAINT nut_pledges_pkey PRIMARY KEY (id);


--
-- Name: nuttracker_orgasms nuttracker_orgasms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuttracker_orgasms
    ADD CONSTRAINT nuttracker_orgasms_pkey PRIMARY KEY (id);


--
-- Name: past_links past_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_links
    ADD CONSTRAINT past_links_pkey PRIMARY KEY (id);


--
-- Name: profile_domains profile_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_domains
    ADD CONSTRAINT profile_domains_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: scoops scoops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoops
    ADD CONSTRAINT scoops_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_blocked_executions solid_queue_blocked_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_blocked_executions
    ADD CONSTRAINT solid_queue_blocked_executions_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_claimed_executions solid_queue_claimed_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_claimed_executions
    ADD CONSTRAINT solid_queue_claimed_executions_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_failed_executions solid_queue_failed_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_failed_executions
    ADD CONSTRAINT solid_queue_failed_executions_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_jobs solid_queue_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_jobs
    ADD CONSTRAINT solid_queue_jobs_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_pauses solid_queue_pauses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_pauses
    ADD CONSTRAINT solid_queue_pauses_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_processes solid_queue_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_processes
    ADD CONSTRAINT solid_queue_processes_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_ready_executions solid_queue_ready_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_ready_executions
    ADD CONSTRAINT solid_queue_ready_executions_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_recurring_executions solid_queue_recurring_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_recurring_executions
    ADD CONSTRAINT solid_queue_recurring_executions_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_recurring_tasks solid_queue_recurring_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_recurring_tasks
    ADD CONSTRAINT solid_queue_recurring_tasks_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_scheduled_executions solid_queue_scheduled_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_scheduled_executions
    ADD CONSTRAINT solid_queue_scheduled_executions_pkey PRIMARY KEY (id);


--
-- Name: solid_queue_semaphores solid_queue_semaphores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_semaphores
    ADD CONSTRAINT solid_queue_semaphores_pkey PRIMARY KEY (id);


--
-- Name: surrenders surrenders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surrenders
    ADD CONSTRAINT surrenders_pkey PRIMARY KEY (id);


--
-- Name: survey_response_answers survey_response_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response_answers
    ADD CONSTRAINT survey_response_answers_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: user_icons user_icons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_icons
    ADD CONSTRAINT user_icons_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallpaper_clients wallpaper_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallpaper_clients
    ADD CONSTRAINT wallpaper_clients_pkey PRIMARY KEY (id);


--
-- Name: index_action_mailbox_inbound_emails_uniqueness; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_action_mailbox_inbound_emails_uniqueness ON public.action_mailbox_inbound_emails USING btree (message_id, message_checksum);


--
-- Name: index_action_text_rich_texts_uniqueness; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_action_text_rich_texts_uniqueness ON public.action_text_rich_texts USING btree (record_type, record_id, name);


--
-- Name: index_active_storage_attachments_on_blob_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_active_storage_attachments_on_blob_id ON public.active_storage_attachments USING btree (blob_id);


--
-- Name: index_active_storage_attachments_uniqueness; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_active_storage_attachments_uniqueness ON public.active_storage_attachments USING btree (record_type, record_id, name, blob_id);


--
-- Name: index_active_storage_blobs_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_active_storage_blobs_on_key ON public.active_storage_blobs USING btree (key);


--
-- Name: index_active_storage_variant_records_uniqueness; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_active_storage_variant_records_uniqueness ON public.active_storage_variant_records USING btree (blob_id, variation_digest);


--
-- Name: index_ahoy_events_on_name_and_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ahoy_events_on_name_and_time ON public.ahoy_events USING btree (name, "time");


--
-- Name: index_ahoy_events_on_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ahoy_events_on_time ON public.ahoy_events USING btree ("time");


--
-- Name: index_ahoy_events_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ahoy_events_on_user_id ON public.ahoy_events USING btree (user_id);


--
-- Name: index_ahoy_events_on_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ahoy_events_on_visit_id ON public.ahoy_events USING btree (visit_id);


--
-- Name: index_ahoy_visits_on_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ahoy_visits_on_started_at ON public.ahoy_visits USING btree (started_at);


--
-- Name: index_ahoy_visits_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ahoy_visits_on_user_id ON public.ahoy_visits USING btree (user_id);


--
-- Name: index_ahoy_visits_on_visit_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_ahoy_visits_on_visit_token ON public.ahoy_visits USING btree (visit_token);


--
-- Name: index_banned_ips_on_ip_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_banned_ips_on_ip_address ON public.banned_ips USING btree (ip_address);


--
-- Name: index_blazer_audits_on_query_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_audits_on_query_id ON public.blazer_audits USING btree (query_id);


--
-- Name: index_blazer_audits_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_audits_on_user_id ON public.blazer_audits USING btree (user_id);


--
-- Name: index_blazer_checks_on_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_checks_on_creator_id ON public.blazer_checks USING btree (creator_id);


--
-- Name: index_blazer_checks_on_query_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_checks_on_query_id ON public.blazer_checks USING btree (query_id);


--
-- Name: index_blazer_dashboard_queries_on_dashboard_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_dashboard_queries_on_dashboard_id ON public.blazer_dashboard_queries USING btree (dashboard_id);


--
-- Name: index_blazer_dashboard_queries_on_query_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_dashboard_queries_on_query_id ON public.blazer_dashboard_queries USING btree (query_id);


--
-- Name: index_blazer_dashboards_on_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_dashboards_on_creator_id ON public.blazer_dashboards USING btree (creator_id);


--
-- Name: index_blazer_queries_on_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_blazer_queries_on_creator_id ON public.blazer_queries USING btree (creator_id);


--
-- Name: index_comments_on_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_comments_on_link_id ON public.comments USING btree (link_id);


--
-- Name: index_comments_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_comments_on_user_id ON public.comments USING btree (user_id);


--
-- Name: index_crono_jobs_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_crono_jobs_on_job_id ON public.crono_jobs USING btree (job_id);


--
-- Name: index_emoji_link_decorations_on_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_emoji_link_decorations_on_link_id ON public.emoji_link_decorations USING btree (link_id);


--
-- Name: index_form_elements_on_survey_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_form_elements_on_survey_id ON public.form_elements USING btree (survey_id);


--
-- Name: index_form_elements_on_survey_id_and_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_form_elements_on_survey_id_and_sort_order ON public.form_elements USING btree (survey_id, sort_order);


--
-- Name: index_friendships_on_receiver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_friendships_on_receiver_id ON public.friendships USING btree (receiver_id);


--
-- Name: index_friendships_on_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_friendships_on_sender_id ON public.friendships USING btree (sender_id);


--
-- Name: index_friendships_on_sender_id_and_receiver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_friendships_on_sender_id_and_receiver_id ON public.friendships USING btree (sender_id, receiver_id);


--
-- Name: index_history_events_on_ahoy_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_history_events_on_ahoy_visit_id ON public.history_events USING btree (ahoy_visit_id);


--
-- Name: index_history_events_on_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_history_events_on_link_id ON public.history_events USING btree (link_id);


--
-- Name: index_history_events_on_surrender_controller_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_history_events_on_surrender_controller_id ON public.history_events USING btree (surrender_controller_id);


--
-- Name: index_history_events_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_history_events_on_user_id ON public.history_events USING btree (user_id);


--
-- Name: index_history_events_on_user_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_history_events_on_user_id_and_id ON public.history_events USING btree (user_id, id DESC);


--
-- Name: index_invite_codes_on_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_invite_codes_on_code ON public.invite_codes USING btree (code);


--
-- Name: index_invite_codes_on_generated_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_invite_codes_on_generated_by_id ON public.invite_codes USING btree (generated_by_id);


--
-- Name: index_invite_codes_on_redeemed_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_invite_codes_on_redeemed_by_id ON public.invite_codes USING btree (redeemed_by_id);


--
-- Name: index_kink_havers_on_kink_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_kink_havers_on_kink_id ON public.kink_havers USING btree (kink_id);


--
-- Name: index_kink_havers_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_kink_havers_on_user_id ON public.kink_havers USING btree (user_id);


--
-- Name: index_kinks_on_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_kinks_on_name ON public.kinks USING btree (name);


--
-- Name: index_leashes_on_friendship_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_leashes_on_friendship_id ON public.leashes USING btree (friendship_id);


--
-- Name: index_leashes_on_master_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_leashes_on_master_id ON public.leashes USING btree (master_id);


--
-- Name: index_leashes_on_pet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_leashes_on_pet_id ON public.leashes USING btree (pet_id);


--
-- Name: index_link_abilities_on_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_link_abilities_on_link_id ON public.link_abilities USING btree (link_id);


--
-- Name: index_links_on_e621_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_links_on_e621_post_id ON public.links USING btree (e621_post_id);


--
-- Name: index_links_on_forked_from_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_links_on_forked_from_id ON public.links USING btree (forked_from_id);


--
-- Name: index_links_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_links_on_user_id ON public.links USING btree (user_id);


--
-- Name: index_node_account_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_account_events_on_request_key ON public.node_account_events USING btree (request_key);


--
-- Name: index_node_activity_receipts_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_activity_receipts_on_request_key ON public.node_activity_receipts USING btree (request_key);


--
-- Name: index_node_activity_receipts_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_activity_receipts_on_user_id ON public.node_activity_receipts USING btree (user_id);


--
-- Name: index_node_automation_events_on_available_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_automation_events_on_available_at ON public.node_automation_events USING btree (available_at) WHERE (delivered_at IS NULL);


--
-- Name: index_node_automation_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_automation_events_on_request_key ON public.node_automation_events USING btree (request_key);


--
-- Name: index_node_automation_jobs_on_job_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_automation_jobs_on_job_key ON public.node_automation_jobs USING btree (job_key);


--
-- Name: index_node_automation_jobs_on_locked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_automation_jobs_on_locked_at ON public.node_automation_jobs USING btree (locked_at) WHERE ((status)::text = 'running'::text);


--
-- Name: index_node_automation_jobs_on_run_at_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_automation_jobs_on_run_at_and_id ON public.node_automation_jobs USING btree (run_at, id) WHERE ((status)::text = 'queued'::text);


--
-- Name: index_node_browser_legacy_sessions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_browser_legacy_sessions_on_user_id ON public.node_browser_legacy_sessions USING btree (user_id);


--
-- Name: index_node_browser_sessions_on_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_browser_sessions_on_expires_at ON public.node_browser_sessions USING btree (expires_at);


--
-- Name: index_node_browser_sessions_on_original_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_browser_sessions_on_original_actor_id ON public.node_browser_sessions USING btree (original_actor_id);


--
-- Name: index_node_browser_sessions_on_surrender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_browser_sessions_on_surrender_id ON public.node_browser_sessions USING btree (surrender_id);


--
-- Name: index_node_browser_sessions_on_token_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_browser_sessions_on_token_digest ON public.node_browser_sessions USING btree (token_digest);


--
-- Name: index_node_browser_sessions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_browser_sessions_on_user_id ON public.node_browser_sessions USING btree (user_id);


--
-- Name: index_node_link_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_link_events_on_request_key ON public.node_link_events USING btree (request_key);


--
-- Name: index_node_moderation_events_on_available_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_moderation_events_on_available_at ON public.node_moderation_events USING btree (available_at) WHERE (delivered_at IS NULL);


--
-- Name: index_node_moderation_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_moderation_events_on_request_key ON public.node_moderation_events USING btree (request_key);


--
-- Name: index_node_reaction_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_reaction_events_on_request_key ON public.node_reaction_events USING btree (request_key);


--
-- Name: index_node_social_events_on_available_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_social_events_on_available_at ON public.node_social_events USING btree (available_at) WHERE (delivered_at IS NULL);


--
-- Name: index_node_social_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_social_events_on_request_key ON public.node_social_events USING btree (request_key);


--
-- Name: index_node_tracker_events_on_available_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_node_tracker_events_on_available_at ON public.node_tracker_events USING btree (available_at) WHERE (delivered_at IS NULL);


--
-- Name: index_node_tracker_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_tracker_events_on_request_key ON public.node_tracker_events USING btree (request_key);


--
-- Name: index_node_wallpaper_events_on_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_node_wallpaper_events_on_request_key ON public.node_wallpaper_events USING btree (request_key);


--
-- Name: index_notifications_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_notifications_on_user_id ON public.notifications USING btree (user_id);


--
-- Name: index_nut_pledges_on_past_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_nut_pledges_on_past_link_id ON public.nut_pledges USING btree (past_link_id);


--
-- Name: index_nut_pledges_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_nut_pledges_on_user_id ON public.nut_pledges USING btree (user_id);


--
-- Name: index_nut_pledges_on_user_id_and_year; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_nut_pledges_on_user_id_and_year ON public.nut_pledges USING btree (user_id, year);


--
-- Name: index_nuttracker_orgasms_on_caused_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_nuttracker_orgasms_on_caused_by_user_id ON public.nuttracker_orgasms USING btree (caused_by_user_id);


--
-- Name: index_nuttracker_orgasms_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_nuttracker_orgasms_on_user_id ON public.nuttracker_orgasms USING btree (user_id);


--
-- Name: index_past_links_on_e621_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_past_links_on_e621_post_id ON public.past_links USING btree (e621_post_id);


--
-- Name: index_past_links_on_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_past_links_on_link_id ON public.past_links USING btree (link_id);


--
-- Name: index_past_links_on_set_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_past_links_on_set_by_id ON public.past_links USING btree (set_by_id);


--
-- Name: index_past_links_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_past_links_on_user_id ON public.past_links USING btree (user_id);


--
-- Name: index_pending_node_link_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_pending_node_link_events ON public.node_link_events USING btree (id) WHERE (delivered_at IS NULL);


--
-- Name: index_pending_node_reaction_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_pending_node_reaction_events ON public.node_reaction_events USING btree (id) WHERE (delivered_at IS NULL);


--
-- Name: index_pending_node_wallpaper_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_pending_node_wallpaper_events ON public.node_wallpaper_events USING btree (id) WHERE (delivered_at IS NULL);


--
-- Name: index_profile_domains_on_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_profile_domains_on_domain ON public.profile_domains USING btree (domain);


--
-- Name: index_profile_domains_on_reviewed_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_profile_domains_on_reviewed_by_id ON public.profile_domains USING btree (reviewed_by_id);


--
-- Name: index_profile_domains_on_status_and_last_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_profile_domains_on_status_and_last_seen_at ON public.profile_domains USING btree (status, last_seen_at);


--
-- Name: index_profiles_on_origin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_profiles_on_origin_id ON public.profiles USING btree (origin_id);


--
-- Name: index_profiles_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_profiles_on_user_id ON public.profiles USING btree (user_id);


--
-- Name: index_reports_on_reportable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_reports_on_reportable ON public.reports USING btree (reportable_type, reportable_id);


--
-- Name: index_reports_on_reporter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_reports_on_reporter_id ON public.reports USING btree (reporter_id);


--
-- Name: index_scoops_on_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_scoops_on_link_id ON public.scoops USING btree (link_id);


--
-- Name: index_scoops_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_scoops_on_user_id ON public.scoops USING btree (user_id);


--
-- Name: index_site_settings_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_site_settings_on_key ON public.site_settings USING btree (key);


--
-- Name: index_solid_queue_blocked_executions_for_maintenance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_blocked_executions_for_maintenance ON public.solid_queue_blocked_executions USING btree (expires_at, concurrency_key);


--
-- Name: index_solid_queue_blocked_executions_for_release; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_blocked_executions_for_release ON public.solid_queue_blocked_executions USING btree (concurrency_key, priority, job_id);


--
-- Name: index_solid_queue_blocked_executions_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_blocked_executions_on_job_id ON public.solid_queue_blocked_executions USING btree (job_id);


--
-- Name: index_solid_queue_claimed_executions_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_claimed_executions_on_job_id ON public.solid_queue_claimed_executions USING btree (job_id);


--
-- Name: index_solid_queue_claimed_executions_on_process_id_and_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_claimed_executions_on_process_id_and_job_id ON public.solid_queue_claimed_executions USING btree (process_id, job_id);


--
-- Name: index_solid_queue_dispatch_all; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_dispatch_all ON public.solid_queue_scheduled_executions USING btree (scheduled_at, priority, job_id);


--
-- Name: index_solid_queue_failed_executions_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_failed_executions_on_job_id ON public.solid_queue_failed_executions USING btree (job_id);


--
-- Name: index_solid_queue_jobs_for_alerting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_jobs_for_alerting ON public.solid_queue_jobs USING btree (scheduled_at, finished_at);


--
-- Name: index_solid_queue_jobs_for_filtering; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_jobs_for_filtering ON public.solid_queue_jobs USING btree (queue_name, finished_at);


--
-- Name: index_solid_queue_jobs_on_active_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_jobs_on_active_job_id ON public.solid_queue_jobs USING btree (active_job_id);


--
-- Name: index_solid_queue_jobs_on_class_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_jobs_on_class_name ON public.solid_queue_jobs USING btree (class_name);


--
-- Name: index_solid_queue_jobs_on_finished_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_jobs_on_finished_at ON public.solid_queue_jobs USING btree (finished_at);


--
-- Name: index_solid_queue_pauses_on_queue_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_pauses_on_queue_name ON public.solid_queue_pauses USING btree (queue_name);


--
-- Name: index_solid_queue_poll_all; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_poll_all ON public.solid_queue_ready_executions USING btree (priority, job_id);


--
-- Name: index_solid_queue_poll_by_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_poll_by_queue ON public.solid_queue_ready_executions USING btree (queue_name, priority, job_id);


--
-- Name: index_solid_queue_processes_on_last_heartbeat_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_processes_on_last_heartbeat_at ON public.solid_queue_processes USING btree (last_heartbeat_at);


--
-- Name: index_solid_queue_processes_on_name_and_supervisor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_processes_on_name_and_supervisor_id ON public.solid_queue_processes USING btree (name, supervisor_id);


--
-- Name: index_solid_queue_processes_on_supervisor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_processes_on_supervisor_id ON public.solid_queue_processes USING btree (supervisor_id);


--
-- Name: index_solid_queue_ready_executions_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_ready_executions_on_job_id ON public.solid_queue_ready_executions USING btree (job_id);


--
-- Name: index_solid_queue_recurring_executions_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_recurring_executions_on_job_id ON public.solid_queue_recurring_executions USING btree (job_id);


--
-- Name: index_solid_queue_recurring_executions_on_task_key_and_run_at; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_recurring_executions_on_task_key_and_run_at ON public.solid_queue_recurring_executions USING btree (task_key, run_at);


--
-- Name: index_solid_queue_recurring_tasks_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_recurring_tasks_on_key ON public.solid_queue_recurring_tasks USING btree (key);


--
-- Name: index_solid_queue_recurring_tasks_on_static; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_recurring_tasks_on_static ON public.solid_queue_recurring_tasks USING btree (static);


--
-- Name: index_solid_queue_scheduled_executions_on_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_scheduled_executions_on_job_id ON public.solid_queue_scheduled_executions USING btree (job_id);


--
-- Name: index_solid_queue_semaphores_on_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_semaphores_on_expires_at ON public.solid_queue_semaphores USING btree (expires_at);


--
-- Name: index_solid_queue_semaphores_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_solid_queue_semaphores_on_key ON public.solid_queue_semaphores USING btree (key);


--
-- Name: index_solid_queue_semaphores_on_key_and_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_solid_queue_semaphores_on_key_and_value ON public.solid_queue_semaphores USING btree (key, value);


--
-- Name: index_surrenders_on_controller_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_surrenders_on_controller_user_id ON public.surrenders USING btree (controller_user_id);


--
-- Name: index_surrenders_on_friendship_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_surrenders_on_friendship_id ON public.surrenders USING btree (friendship_id);


--
-- Name: index_surrenders_on_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_surrenders_on_token ON public.surrenders USING btree (token);


--
-- Name: index_surrenders_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_surrenders_on_user_id ON public.surrenders USING btree (user_id);


--
-- Name: index_surrenders_on_user_id_and_controller_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_surrenders_on_user_id_and_controller_user_id ON public.surrenders USING btree (user_id, controller_user_id);


--
-- Name: index_survey_response_answers_on_form_element_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_survey_response_answers_on_form_element_id ON public.survey_response_answers USING btree (form_element_id);


--
-- Name: index_survey_response_answers_on_survey_response_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_survey_response_answers_on_survey_response_id ON public.survey_response_answers USING btree (survey_response_id);


--
-- Name: index_survey_responses_on_survey_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_survey_responses_on_survey_id ON public.survey_responses USING btree (survey_id);


--
-- Name: index_survey_responses_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_survey_responses_on_user_id ON public.survey_responses USING btree (user_id);


--
-- Name: index_surveys_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_surveys_on_user_id ON public.surveys USING btree (user_id);


--
-- Name: index_user_icons_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_icons_on_user_id ON public.user_icons USING btree (user_id);


--
-- Name: index_users_on_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_users_on_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: index_users_on_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_users_on_profile_id ON public.users USING btree (profile_id);


--
-- Name: index_users_on_set_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_users_on_set_count ON public.users USING btree (set_count DESC);


--
-- Name: index_users_on_viewing_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_users_on_viewing_link_id ON public.users USING btree (viewing_link_id);


--
-- Name: node_account_events_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX node_account_events_pending ON public.node_account_events USING btree (available_at) WHERE (delivered_at IS NULL);


--
-- Name: unique_emails; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_emails ON public.users USING btree (email);


--
-- Name: unique_usernames; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_usernames ON public.users USING btree (username);


--
-- Name: links fk_rails_005e9b2a6a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT fk_rails_005e9b2a6a FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: history_events fk_rails_0341682ff0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_events
    ADD CONSTRAINT fk_rails_0341682ff0 FOREIGN KEY (link_id) REFERENCES public.links(id);


--
-- Name: comments fk_rails_03de2dc08c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT fk_rails_03de2dc08c FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: survey_response_answers fk_rails_0458ef2b33; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response_answers
    ADD CONSTRAINT fk_rails_0458ef2b33 FOREIGN KEY (form_element_id) REFERENCES public.form_elements(id);


--
-- Name: friendships fk_rails_19981bd36e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT fk_rails_19981bd36e FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: banned_ips fk_rails_244966a304; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_ips
    ADD CONSTRAINT fk_rails_244966a304 FOREIGN KEY (banned_by_id) REFERENCES public.users(id);


--
-- Name: user_icons fk_rails_27a6cd640c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_icons
    ADD CONSTRAINT fk_rails_27a6cd640c FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: nut_pledges fk_rails_29ee8bddea; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nut_pledges
    ADD CONSTRAINT fk_rails_29ee8bddea FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: surveys fk_rails_2a50b6eb90; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT fk_rails_2a50b6eb90 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: profile_domains fk_rails_2bd45d9e9a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_domains
    ADD CONSTRAINT fk_rails_2bd45d9e9a FOREIGN KEY (reviewed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: solid_queue_recurring_executions fk_rails_318a5533ed; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_recurring_executions
    ADD CONSTRAINT fk_rails_318a5533ed FOREIGN KEY (job_id) REFERENCES public.solid_queue_jobs(id) ON DELETE CASCADE;


--
-- Name: history_events fk_rails_31b5a644af; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_events
    ADD CONSTRAINT fk_rails_31b5a644af FOREIGN KEY (ahoy_visit_id) REFERENCES public.ahoy_visits(id);


--
-- Name: solid_queue_failed_executions fk_rails_39bbc7a631; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_failed_executions
    ADD CONSTRAINT fk_rails_39bbc7a631 FOREIGN KEY (job_id) REFERENCES public.solid_queue_jobs(id) ON DELETE CASCADE;


--
-- Name: kink_havers fk_rails_3cc81ad8de; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kink_havers
    ADD CONSTRAINT fk_rails_3cc81ad8de FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: surrenders fk_rails_3e4a0ecfef; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surrenders
    ADD CONSTRAINT fk_rails_3e4a0ecfef FOREIGN KEY (friendship_id) REFERENCES public.friendships(id);


--
-- Name: past_links fk_rails_4a0cfe6003; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_links
    ADD CONSTRAINT fk_rails_4a0cfe6003 FOREIGN KEY (link_id) REFERENCES public.links(id) ON DELETE SET NULL;


--
-- Name: solid_queue_blocked_executions fk_rails_4cd34e2228; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_blocked_executions
    ADD CONSTRAINT fk_rails_4cd34e2228 FOREIGN KEY (job_id) REFERENCES public.solid_queue_jobs(id) ON DELETE CASCADE;


--
-- Name: links fk_rails_5bb16c7477; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT fk_rails_5bb16c7477 FOREIGN KEY (forked_from_id) REFERENCES public.links(id);


--
-- Name: leashes fk_rails_65b485df0e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leashes
    ADD CONSTRAINT fk_rails_65b485df0e FOREIGN KEY (pet_id) REFERENCES public.users(id);


--
-- Name: past_links fk_rails_750c68aa13; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_links
    ADD CONSTRAINT fk_rails_750c68aa13 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: solid_queue_ready_executions fk_rails_81fcbd66af; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_ready_executions
    ADD CONSTRAINT fk_rails_81fcbd66af FOREIGN KEY (job_id) REFERENCES public.solid_queue_jobs(id) ON DELETE CASCADE;


--
-- Name: kink_havers fk_rails_83a793f0ca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kink_havers
    ADD CONSTRAINT fk_rails_83a793f0ca FOREIGN KEY (kink_id) REFERENCES public.kinks(id);


--
-- Name: active_storage_variant_records fk_rails_993965df05; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_variant_records
    ADD CONSTRAINT fk_rails_993965df05 FOREIGN KEY (blob_id) REFERENCES public.active_storage_blobs(id);


--
-- Name: solid_queue_claimed_executions fk_rails_9cfe4d4944; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_claimed_executions
    ADD CONSTRAINT fk_rails_9cfe4d4944 FOREIGN KEY (job_id) REFERENCES public.solid_queue_jobs(id) ON DELETE CASCADE;


--
-- Name: links fk_rails_a40aea41b7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT fk_rails_a40aea41b7 FOREIGN KEY (set_by_id) REFERENCES public.users(id);


--
-- Name: users fk_rails_a8794354f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_rails_a8794354f0 FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: invite_codes fk_rails_a89b18c444; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT fk_rails_a89b18c444 FOREIGN KEY (redeemed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: profiles fk_rails_aa096da6b4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_rails_aa096da6b4 FOREIGN KEY (origin_id) REFERENCES public.profiles(id);


--
-- Name: history_events fk_rails_b07eac6dbb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_events
    ADD CONSTRAINT fk_rails_b07eac6dbb FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notifications fk_rails_b080fb4855; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_rails_b080fb4855 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: survey_responses fk_rails_b0f344463a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT fk_rails_b0f344463a FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: nuttracker_orgasms fk_rails_b7a65e8136; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuttracker_orgasms
    ADD CONSTRAINT fk_rails_b7a65e8136 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: nut_pledges fk_rails_bfc964282f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nut_pledges
    ADD CONSTRAINT fk_rails_bfc964282f FOREIGN KEY (past_link_id) REFERENCES public.past_links(id);


--
-- Name: leashes fk_rails_c01c548a79; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leashes
    ADD CONSTRAINT fk_rails_c01c548a79 FOREIGN KEY (master_id) REFERENCES public.users(id);


--
-- Name: users fk_rails_c05280afad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_rails_c05280afad FOREIGN KEY (viewing_link_id) REFERENCES public.links(id);


--
-- Name: history_events fk_rails_c2ad01ceaa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_events
    ADD CONSTRAINT fk_rails_c2ad01ceaa FOREIGN KEY (surrender_controller_id) REFERENCES public.users(id);


--
-- Name: active_storage_attachments fk_rails_c3b3935057; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_attachments
    ADD CONSTRAINT fk_rails_c3b3935057 FOREIGN KEY (blob_id) REFERENCES public.active_storage_blobs(id);


--
-- Name: solid_queue_scheduled_executions fk_rails_c4316f352d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solid_queue_scheduled_executions
    ADD CONSTRAINT fk_rails_c4316f352d FOREIGN KEY (job_id) REFERENCES public.solid_queue_jobs(id) ON DELETE CASCADE;


--
-- Name: reports fk_rails_c4cb6e6463; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_rails_c4cb6e6463 FOREIGN KEY (reporter_id) REFERENCES public.users(id);


--
-- Name: leashes fk_rails_cb059aa04d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leashes
    ADD CONSTRAINT fk_rails_cb059aa04d FOREIGN KEY (friendship_id) REFERENCES public.friendships(id);


--
-- Name: comments fk_rails_cf7ef1d4af; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT fk_rails_cf7ef1d4af FOREIGN KEY (link_id) REFERENCES public.links(id);


--
-- Name: link_abilities fk_rails_d181bda96c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_abilities
    ADD CONSTRAINT fk_rails_d181bda96c FOREIGN KEY (link_id) REFERENCES public.links(id);


--
-- Name: invite_codes fk_rails_d45234613d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT fk_rails_d45234613d FOREIGN KEY (generated_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: form_elements fk_rails_d9b94a8b4d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_elements
    ADD CONSTRAINT fk_rails_d9b94a8b4d FOREIGN KEY (survey_id) REFERENCES public.surveys(id);


--
-- Name: surrenders fk_rails_e3bce682dd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surrenders
    ADD CONSTRAINT fk_rails_e3bce682dd FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: profiles fk_rails_e424190865; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_rails_e424190865 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: friendships fk_rails_e507fb3bae; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT fk_rails_e507fb3bae FOREIGN KEY (receiver_id) REFERENCES public.users(id);


--
-- Name: scoops fk_rails_ec23cc9ec9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoops
    ADD CONSTRAINT fk_rails_ec23cc9ec9 FOREIGN KEY (link_id) REFERENCES public.links(id);


--
-- Name: survey_responses fk_rails_ec71731d4b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT fk_rails_ec71731d4b FOREIGN KEY (survey_id) REFERENCES public.surveys(id);


--
-- Name: scoops fk_rails_ee194010c6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoops
    ADD CONSTRAINT fk_rails_ee194010c6 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: survey_response_answers fk_rails_f04ebd8e90; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response_answers
    ADD CONSTRAINT fk_rails_f04ebd8e90 FOREIGN KEY (survey_response_id) REFERENCES public.survey_responses(id);


--
-- Name: past_links fk_rails_f1d6f08c45; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_links
    ADD CONSTRAINT fk_rails_f1d6f08c45 FOREIGN KEY (set_by_id) REFERENCES public.users(id);


--
-- Name: surrenders fk_rails_f5c831262c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surrenders
    ADD CONSTRAINT fk_rails_f5c831262c FOREIGN KEY (controller_user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--


