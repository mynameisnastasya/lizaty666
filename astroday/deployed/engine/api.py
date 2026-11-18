"""Private ASTRODAY v2 service. All calculation endpoints require ASTRO_INTERNAL_TOKEN.

No Telegram messaging, payments, or user records are touched by this service.
The only outward health endpoint exposes no user data.
"""
import hmac
import os
from datetime import date, timedelta
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from engine import build_forecast, birth_chart, factual_digest, VERSION

if os.getenv('RAILWAY_ENVIRONMENT_NAME','staging').lower()=='production':
    raise RuntimeError('Swiss Ephemeris staging build cannot be enabled for closed-source production without a reviewed license')

app=FastAPI(title='ASTRODAY Verified Astronomy v2',version=VERSION,docs_url=None,redoc_url=None,openapi_url=None)

class Birth(BaseModel):
    model_config=ConfigDict(extra='forbid')
    at:str
    accurateBirthTime:bool
    latitude:float=Field(ge=-85,le=85)
    longitude:float=Field(ge=-180,le=180)

class ChartRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    birth:Birth
    houseSystem:Literal['placidus']='placidus'

class ForecastRequest(ChartRequest):
    day:str=Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    timeZone:str=Field(min_length=3,max_length=90)
    localHour:int=Field(default=12,ge=0,le=23)
    includeSky:bool=True
    @field_validator('day')
    @classmethod
    def check_day(cls,v):date.fromisoformat(v);return v
    @field_validator('timeZone')
    @classmethod
    def check_zone(cls,v):
        try: ZoneInfo(v)
        except (ZoneInfoNotFoundError,ValueError) as exc:raise ValueError('Unknown IANA timezone') from exc
        return v

class BatchRequest(ChartRequest):
    startDay:str=Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    timeZone:str=Field(min_length=3,max_length=90)
    days:int=Field(ge=1,le=35)
    localHour:int=Field(default=12,ge=0,le=23)
    includeSky:bool=True
    @field_validator('startDay')
    @classmethod
    def check_day(cls,v):date.fromisoformat(v);return v
    @field_validator('timeZone')
    @classmethod
    def check_zone(cls,v):
        try:ZoneInfo(v)
        except (ZoneInfoNotFoundError,ValueError) as exc:raise ValueError('Unknown IANA timezone') from exc
        return v

def auth(authorization:str|None=Header(default=None)):
    expected=os.getenv('ASTRO_INTERNAL_TOKEN','')
    if len(expected)<32:raise HTTPException(status_code=503,detail='Astrology authorization not configured')
    if not authorization or not hmac.compare_digest(authorization,'Bearer '+expected):
        raise HTTPException(status_code=401,detail='Astrology authorization required')

@app.get('/health')
def health():
    return {'ok':True,'version':VERSION,'houseSystem':'placidus',
            'ephemeris':'Swiss Ephemeris with automatic Moshier fallback',
            'stagingOnly':os.getenv('RAILWAY_ENVIRONMENT_NAME','staging')!='production'}

@app.post('/v2/natal',dependencies=[Depends(auth)])
def natal(request:ChartRequest):
    try:return birth_chart(request.birth.model_dump())
    except (ValueError,KeyError) as e:raise HTTPException(422,detail=str(e))

@app.post('/v2/forecast',dependencies=[Depends(auth)])
def forecast(request:ForecastRequest):
    try:return build_forecast(birth=request.birth.model_dump(),day=request.day,
            time_zone=request.timeZone,local_hour=request.localHour,include_sky=request.includeSky)
    except (ValueError,KeyError) as e:raise HTTPException(422,detail=str(e))

@app.post('/v2/facts',dependencies=[Depends(auth)])
def facts(request:ForecastRequest):
    try:
        c=build_forecast(birth=request.birth.model_dump(),day=request.day,
            time_zone=request.timeZone,local_hour=request.localHour,include_sky=request.includeSky)
        return factual_digest(c)
    except (ValueError,KeyError) as e:raise HTTPException(422,detail=str(e))

@app.post('/v2/batch',dependencies=[Depends(auth)])
def batch(request:BatchRequest):
    try:
        first=date.fromisoformat(request.startDay)
        rows=[build_forecast(birth=request.birth.model_dump(),
            day=(first+timedelta(days=i)).isoformat(),time_zone=request.timeZone,
            local_hour=request.localHour,include_sky=request.includeSky)
            for i in range(request.days)]
        return {'version':VERSION,'count':len(rows),'forecasts':rows}
    except (ValueError,KeyError) as e:raise HTTPException(422,detail=str(e))
