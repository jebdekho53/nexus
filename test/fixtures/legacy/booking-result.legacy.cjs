'use strict';
const text=value=>value==null?'':String(value);

function emptyBooking() {
  return{pnr:'',trainNumber:'',trainName:'',fromStation:'',toStation:'',boardingDate:'',journeyClass:'',quota:'',amount:0,passengers:[],allConfirmed:false};
}
function passengerResult(passenger) {
  const status=passenger.bookingStatusDetails||passenger.currentStatusDetails||'';
  const current=passenger.currentStatusDetails||'';
  return{name:passenger.passengerName||'',status,confirmed:/CNF/i.test(status),
    age:passenger.passengerAge!=null?Number(passenger.passengerAge):undefined,
    gender:text(passenger.passengerGender)||undefined,coach:text(passenger.bookingCoachId)||undefined,
    berth:text(passenger.bookingBerthNo)||undefined,berthType:text(passenger.bookingBerthCode)||undefined,
    currentStatus:current&&current!==status?current:undefined,
    fare:passenger.passengerNetFare!=null?Number(passenger.passengerNetFare):undefined};
}
function normalizeBooking(response,{extractError,empty=emptyBooking}) {
  const body=response??{};
  if(body.bankErrorFlag===true||body.bankErrorFlag==='true')return{...empty(),errorMessage:'Payment Not Captured By IRCTC, Please use different App or Bank to Pay'};
  const row=body.bookingResponseDTO?.[0];
  if(!row){const error=extractError(body);return error?{...empty(),errorMessage:error}:null;}
  const error=row.errorMessage||'',pnr=row.pnrNumber||'';
  if(!pnr)return error?{...empty(),errorMessage:error}:null;
  const passengers=(row.psgnDtlList??[]).map(passengerResult),user=body.userDetail??{};
  const messages=Array.isArray(row.ersDisplayMessage)?row.ersDisplayMessage.map(value=>String(value)).filter(Boolean):undefined;
  return{pnr,trainNumber:row.trainNumber||'',trainName:row.trainName||'',
    fromStation:row.fromStnName||row.fromStn||'',toStation:row.resvnUptoStnName||row.destStnName||row.resvnUptoStn||'',
    fromCode:text(row.fromStn)||undefined,toCode:text(row.resvnUptoStn)||text(row.destStn)||undefined,
    boardingStation:row.boardingStnName||row.boardingStn||undefined,
    boardingDate:String(row.boardingDate||row.journeyDate||'').split('T')[0],
    departureTime:text(row.departureTime)||undefined,arrivalTime:text(row.arrivalTime)||undefined,
    journeyClass:row.journeyClass||'',quota:row.bookedQuota||row.journeyQuota||'',
    amount:Number(row.totalCollectibleAmount??body.totalCollectibleAmount??0),
    paymentMode:text(body.bankNameDis)||text(row.bankNameDis)||text(body.bankPaymentMode)||undefined,
    bookingTime:text(body.bookingDate)||text(row.bookingDate)||undefined,
    reservationId:text(row.reservationId)||text(body.transactionId)||undefined,ticketType:text(row.ticketType)||undefined,
    qrText:text(body.qrCodeText)||text(row.qrCodeText)||undefined,ersMessages:messages,userName:text(user.firstName)||undefined,
    passengers,allConfirmed:passengers.length>0&&passengers.every(passenger=>passenger.confirmed),errorMessage:error||undefined};
}
module.exports={emptyBooking,passengerResult,normalizeBooking};
