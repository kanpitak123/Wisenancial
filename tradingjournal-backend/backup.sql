--
-- PostgreSQL database dump
--

\restrict ZCutEPDUscYaV1VGRfx5S3vh8292icSYNI7JjzahtnvKSSHef0j2VG44ObF2aVI

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: goals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.goals (
    id integer NOT NULL,
    portfolio_id integer,
    year integer NOT NULL,
    month integer NOT NULL,
    target_profit numeric(15,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.goals OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.goals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.goals_id_seq OWNER TO postgres;

--
-- Name: goals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.goals_id_seq OWNED BY public.goals.id;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    price numeric(10,2) NOT NULL,
    duration_days integer NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plans_id_seq OWNER TO postgres;

--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: portfolios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.portfolios (
    id integer NOT NULL,
    user_id integer,
    name character varying(100) NOT NULL,
    initial_balance numeric(15,2) NOT NULL,
    current_balance numeric(15,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.portfolios OWNER TO postgres;

--
-- Name: portfolios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.portfolios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.portfolios_id_seq OWNER TO postgres;

--
-- Name: portfolios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.portfolios_id_seq OWNED BY public.portfolios.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    user_id integer,
    plan_id integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    start_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    end_date timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.subscriptions OWNER TO postgres;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscriptions_id_seq OWNER TO postgres;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: trades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trades (
    id integer NOT NULL,
    portfolio_id integer,
    pair character varying(30) NOT NULL,
    trade_type character varying(15) NOT NULL,
    result_status character varying(10),
    pnl numeric(15,2),
    strategy character varying(100),
    trend character varying(50),
    emotion character varying(50),
    entry_reason text,
    trade_date timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.trades OWNER TO postgres;

--
-- Name: trades_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.trades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trades_id_seq OWNER TO postgres;

--
-- Name: trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.trades_id_seq OWNED BY public.trades.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    full_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: goals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals ALTER COLUMN id SET DEFAULT nextval('public.goals_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: portfolios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portfolios ALTER COLUMN id SET DEFAULT nextval('public.portfolios_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: trades id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trades ALTER COLUMN id SET DEFAULT nextval('public.trades_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.goals (id, portfolio_id, year, month, target_profit, created_at, updated_at) FROM stdin;
1	1	2026	3	10000.00	2026-03-01 00:03:31.047	2026-03-01 00:03:31.047
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plans (id, name, price, duration_days, description, created_at, updated_at) FROM stdin;
1	Basic	0.00	30	แพ็กเกจฟรี สำหรับเริ่มต้นใช้งาน บันทึกได้ 50 ไม้	2026-02-28 18:16:20.113422	2026-02-28 18:16:20.113422
2	Pro	290.00	30	แพ็กเกจโปร บันทึกได้ไม่จำกัด ดูสถิติเชิงลึกได้	2026-02-28 18:16:20.113422	2026-02-28 18:16:20.113422
3	Premium	2900.00	365	แพ็กเกจพรีเมียมรายปี ประหยัดกว่า คุ้มสุดๆ	2026-02-28 18:16:20.113422	2026-02-28 18:16:20.113422
\.


--
-- Data for Name: portfolios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.portfolios (id, user_id, name, initial_balance, current_balance, currency, created_at, updated_at) FROM stdin;
2	1	131	11111.00	22222.00	USD	2026-03-01 11:54:52.508	2026-03-01 11:54:52.508
3	1	eee	1000.00	12111.00	USD	2026-03-01 11:56:49.99	2026-03-01 11:56:49.99
1	1	Testing Port	124123.00	254135.00	USD	2026-02-28 19:25:45.622882	2026-02-28 19:25:45.622882
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscriptions (id, user_id, plan_id, status, start_date, end_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: trades; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.trades (id, portfolio_id, pair, trade_type, result_status, pnl, strategy, trend, emotion, entry_reason, trade_date, created_at, updated_at) FROM stdin;
27	1	BNB/USD	BUY	LOSS	-1111.00	\N	\N	\N	\N	2026-03-01 11:54:58.195	2026-03-01 11:54:58.198	2026-03-01 11:54:58.198
31	3	BTC/USD	BUY	WIN	11111.00	\N	\N	\N	\N	2026-03-01 11:58:22.285	2026-03-01 11:58:22.289	2026-03-01 11:58:22.289
32	1	ETH/USD	BUY	WIN	111.00	\N	\N	\N	\N	2026-03-01 11:58:32.976	2026-03-01 11:58:32.979	2026-03-01 11:58:32.979
33	1	BTC/USD	BUY	WIN	131313.00	pullback	sideway	normal	Resistance	2026-03-01 12:07:04.324	2026-03-01 12:07:04.329	2026-03-01 12:07:04.329
35	1	Deposit	DEPOSIT	WIN	123123.00	FUNDING	\N	\N	Balance Adjustment	2026-03-01 12:07:38.365	2026-03-01 12:07:38.369	2026-03-01 12:07:38.369
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, full_name, email, password, created_at, updated_at) FROM stdin;
1	supertrader	John Doe	trader@mail.com	$2b$10$HdVuaomWUlzcSwH/NFdMZet8KYz8uw/sPt2szPMJ6AGmxvcMftHQm	2026-02-28 12:09:51.085	2026-02-28 12:09:51.085
2	Kiq	Kanokpat	qiw@mail.com	$2b$10$9MkdFfhNJ3Ew5d/h1ToBR.OjNR.cwry/8vgnuGjtlPPmUul2E6iKe	2026-02-28 12:15:41.089	2026-02-28 12:15:41.089
3	1111	1111	1111@mail.com	$2b$10$z5yXAVcJEAvezh67Xv5wcuawS1uz9jAwPRllBaqauBQt2M6ZgSz/m	2026-02-28 12:16:41.034	2026-02-28 12:16:41.034
4	Poom	Kanpitak	Poom@mail.com	$2b$10$fPUHtuJZiPzv19nRhP92re16SlT7PKOKFKO/L/o3G2lpxv1p99PNi	2026-03-01 00:31:10.977	2026-03-01 00:31:10.977
\.


--
-- Name: goals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.goals_id_seq', 1, true);


--
-- Name: plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.plans_id_seq', 3, true);


--
-- Name: portfolios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.portfolios_id_seq', 3, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 1, false);


--
-- Name: trades_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.trades_id_seq', 35, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: goals goals_portfolio_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_portfolio_id_year_month_key UNIQUE (portfolio_id, year, month);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: portfolios portfolios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: goals goals_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id) ON DELETE CASCADE;


--
-- Name: portfolios portfolios_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trades trades_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ZCutEPDUscYaV1VGRfx5S3vh8292icSYNI7JjzahtnvKSSHef0j2VG44ObF2aVI

